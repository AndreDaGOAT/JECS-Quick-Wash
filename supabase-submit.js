diff --git a/supabase-submit.js b/supabase-submit.js
index 51af0bc..56d9e56 100644
--- a/supabase-submit.js
+++ b/supabase-submit.js
@@ -508,113 +508,17 @@ if (form) {
       headers: { Accept: "application/json" },
     });
 
-    // ── STEP 1: customers ──────────────────────
-    const { data: customerData, error: customerError } = await supabase
-      .from("customers")
-      .insert({
-        full_name:         name,
-        email,
-        phone_number:      phone,
-        formatted_address: address,
-        google_place_id:   geo.place_id,
-        zip_code:          geo.zip_code,
-        latitude:          geo.latitude,
-        longitude:         geo.longitude,
-        // created_at omitted — Supabase column default (now()) handles it in UTC
-      })
-      .select("customer_id")
-      .single();
-
-    if (customerError || !customerData) {
-      console.error("[JECS] customers insert failed — code:", customerError?.code, "| message:", customerError?.message, "| details:", customerError?.details);
-      setStatus(
-        customerError?.code === "42501"
-          ? "Database permissions error. Please contact support or call (615) 348-7683."
-          : "Submission failed at customer step. Please try again or call (615) 348-7683.",
-        "error"
-      );
-      setLoading(false);
-      return;
-    }
-
-    const customerId = customerData.customer_id;
-
-    // ── STEP 2: vehicles ───────────────────────
-    // vehicles table columns: customer_id, color, license_plate, vehicle_type
-    // vehicle_type stores the full summary from vehicleTypeSummary hidden field
-    // e.g. "2022 Silver Toyota Camry" — this is what the admin/tech will see.
+    // ── STEPS 1–4: one atomic booking via RPC ──
+    // create_booking (Supabase, SECURITY DEFINER) inserts customer, vehicle,
+    // service request and appointment in a single transaction. The browser no
+    // longer needs write access to any table.
     const vehicleTypeSummary = String(fd.get("vehicle_type") || "").trim() || null;
-
-    // Build the best possible vehicle_type string from all available sources
     const vehicleTypeValue = vehicleTypeSummary
       || [vehicleYear, vehicleColor, vehicleMake, vehicleModel].filter(Boolean).join(" ")
       || null;
 
-    const hasVehicleInfo = !!(vehicleTypeValue || vehicleColor || licensePlate);
-
-    let vehicleId = null;
-    if (hasVehicleInfo) {
-      const { data: vData, error: vError } = await supabase
-        .from("vehicles")
-        .insert({
-          customer_id:   customerId,
-          color:         vehicleColor   || null,
-          license_plate: licensePlate   || null,
-          vehicle_type:  vehicleTypeValue || null,
-        })
-        .select("vehicle_id")
-        .single();
-
-      if (vError || !vData) {
-        console.warn("[JECS] vehicles insert failed — code:", vError?.code,
-          "| message:", vError?.message,
-          "| hint:", vError?.hint);
-      } else {
-        vehicleId = vData.vehicle_id;
-        console.info("[JECS] ✅ Vehicle created:", vehicleId,
-          "| type:", vehicleTypeValue,
-          "| color:", vehicleColor,
-          "| plate:", licensePlate);
-      }
-    }
-
-    // ── STEP 3: service_requests ───────────────
     const packageId = await resolvePackageId(service);
-    console.info("[JECS] Resolved package_id:", packageId, "from service value:", service);
-
-    const { data: srData, error: srError } = await supabase
-      .from("service_requests")
-      .insert({
-        service_request_number: srn,
-        customer_id:            customerId,
-        vehicle_id:             vehicleId,
-        package_id:             packageId,
-        special_notes:          notes,
-        status:                 "pending_confirmation",
-        requested_date:         requestedDate,
-        client_timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
-        // created_at omitted — Supabase column default handles it in UTC
-      })
-      .select("request_id")
-      .single();
-
-    if (srError || !srData) {
-      console.error("[JECS] service_requests insert failed — code:", srError?.code, "| message:", srError?.message, "| details:", srError?.details);
-      setStatus(
-        srError?.code === "42501"
-          ? "Database permissions error. Please contact support or call (615) 348-7683."
-          : "Submission failed at request step. Please try again or call (615) 348-7683.",
-        "error"
-      );
-      setLoading(false);
-      return;
-    }
 
-    const requestId = srData.request_id;
-
-    // ── STEP 4: appointments ──────────────────
-    // Map the form's time window values to 24-hr start/end times.
-    // Form values: "8AM-11AM" | "11AM-2PM" | "2PM-5PM"
     let scheduledStart = null;
     let scheduledEnd   = null;
 
@@ -642,56 +546,63 @@ if (form) {
     }
 
     if (!scheduledStart) {
-      console.error("[JECS] appointments insert skipped — no requestedDate selected.");
-    } else {
-      const { error: apptError } = await supabase
-        .from("appointments")
-        .insert({
-          // Core relationships
-          customer_id:           customerId,
-          service_request_id:    requestId,
-
-          // Scheduling
+      console.error("[JECS] No requestedDate selected — booking saved without an appointment.");
+    }
+
+    const weatherScore = (() => {
+      try {
+        const forecast = JSON.parse(sessionStorage.getItem("jecs_forecast") || "{}");
+        return forecast[requestedDate]?.score ?? null;
+      } catch (_) { return null; }
+    })();
+
+    const { data: booking, error: bookingError } = await supabase.rpc("create_booking", {
+      p: {
+        customer: {
+          full_name:         name,
+          email,
+          phone_number:      phone,
+          formatted_address: address,
+          google_place_id:   geo.place_id,
+          zip_code:          geo.zip_code,
+          latitude:          geo.latitude,
+          longitude:         geo.longitude,
+        },
+        vehicle: {
+          color:         vehicleColor     || null,
+          license_plate: licensePlate     || null,
+          vehicle_type:  vehicleTypeValue || null,
+        },
+        request: {
+          service_request_number: srn,
+          package_id:             packageId,
+          special_notes:          notes,
+          requested_date:         requestedDate,
+          client_timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
+        },
+        appointment: scheduledStart ? {
           scheduled_start:       scheduledStart,
           scheduled_end:         scheduledEnd,
           preferred_time_window: timeWindow || null,
-
-          // Status — enters pipeline at first stage
-          appointment_status:    "Requested",
-
-          // Customer notes from form
           customer_notes:        notes || null,
+          weather_score:         weatherScore,
+        } : null,
+      },
+    });
 
-          // Weather score from calendar session (if available)
-          weather_score: (() => {
-            try {
-              const forecast = JSON.parse(sessionStorage.getItem("jecs_forecast") || "{}");
-              const dayData  = forecast[requestedDate];
-              return dayData?.score ?? null;
-            } catch (_) { return null; }
-          })(),
-        });
-
-      if (apptError) {
-        console.error(
-          "[JECS] appointments insert failed",
-          "| code:", apptError?.code,
-          "| message:", apptError?.message,
-          "| details:", apptError?.details,
-          "| hint:", apptError?.hint
-        );
-        // Non-fatal — service request saved, but log clearly for admin visibility
-      } else {
-        console.info("[JECS] ✅ Appointment record created — SRN:", srn,
-          "| customer:", customerId,
-          "| vehicle:", vehicleId,
-          "| date:", requestedDate,
-          "| window:", timeWindow,
-          "| start:", scheduledStart
-        );
-      }
+    if (bookingError || !booking) {
+      console.error("[JECS] create_booking failed — code:", bookingError?.code,
+        "| message:", bookingError?.message, "| details:", bookingError?.details);
+      setStatus(
+        "Submission failed. Please try again or call (615) 348-7683.",
+        "error"
+      );
+      setLoading(false);
+      return;
     }
 
+    console.info("[JECS] ✅ Booking created — SRN:", srn, "| request:", booking.request_id);
+
     // Notify weather-calendar.js to refresh slot counts
     document.dispatchEvent(new CustomEvent("jecs:submitted", {
       detail: { srn, requestedDate, service },
@@ -724,15 +635,6 @@ if (form) {
       address, requestedDate, timeWindow, notes,
     });
 
-    // ── STEP 6: Update status ──────────────────
-    const finalStatus = emailResult.ok ? "confirmed" : "pending_confirmation";
-    try {
-      await supabase
-        .from("service_requests")
-        .update({ status: finalStatus })
-        .eq("request_id", requestId);
-    } catch (_) { /* non-fatal */ }
-
     // ── STEP 7: Success card ───────────────────
     const pkg           = PACKAGES[service] || {};
     const serviceLabel  = pkg.label || service || "Service";
diff --git a/weather-calendar.js b/weather-calendar.js
index a52b4af..b6cd374 100644
--- a/weather-calendar.js
+++ b/weather-calendar.js
@@ -267,25 +267,26 @@
     const to       = toDateKey(toDate);
     const clusters = clusterGroup(zip);
 
-    const qs = [
-      `select=requested_date,package_id,status,customers(zip_code)`,
-      `requested_date=gte.${from}`,
-      `requested_date=lte.${to}`,
-      `status=neq.cancelled`,
-    ].join("&");
-
     try {
+      // get_schedule_load returns date, package and 3-digit zip prefix only (no customer PII).
       const r = await fetch(
-        `${SUPABASE_URL}/rest/v1/service_requests?${qs}`,
+        `${SUPABASE_URL}/rest/v1/rpc/get_schedule_load`,
         {
+          method: "POST",
           headers: {
             "apikey":        SUPABASE_ANON_KEY,
             "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
+            "Content-Type":  "application/json",
           },
+          body: JSON.stringify({ p_from: from, p_to: to }),
         }
       );
       if (!r.ok) throw new Error(`Supabase ${r.status}`);
-      const rows = await r.json();
+      const rows = (await r.json()).map(row => ({
+        requested_date: row.requested_date,
+        package_id:     row.package_id,
+        customers:      { zip_code: row.zip_prefix },
+      }));
 
       const agg = {};
       rows.forEach(row => {
