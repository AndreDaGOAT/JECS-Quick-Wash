:root {
  --navy-900: #0a1020;
  --navy-800: #111a2d;
  --gold-500: #c49a5b;
  --gold-600: #ac7b38;
  --cream-050: #f9f6f0;
  --cream-100: #f2ebdf;
  --white: #ffffff;
  --ink: #1d2433;
  --muted: #677083;
  --line: #ddcfbb;
  --shadow: 0 18px 40px rgba(10, 16, 32, 0.14);
  --max: 1160px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
  background: var(--cream-050);
  color: var(--ink);
  line-height: 1.65;
}

h1,
h2,
h3,
.brand {
  font-family: "Playfair Display", Georgia, serif;
  letter-spacing: 0.01em;
}

.container {
  width: min(100% - 2.4rem, var(--max));
  margin-inline: auto;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.97);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(10px);
}

.nav-wrap {
  min-height: 5.2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand {
  text-decoration: none;
  color: var(--navy-800);
  font-size: 1.08rem;
  font-weight: 700;
}

.nav {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.95rem;
}

.nav a {
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.77rem;
  font-weight: 700;
  color: #2b3651;
}

.nav a:hover { color: var(--gold-600); }

.section { padding: 4.6rem 0; }
.section-alt {
  background: linear-gradient(180deg, #fff 0%, var(--cream-100) 100%);
  border-top: 1px solid #eadfce;
  border-bottom: 1px solid #eadfce;
}

.hero,
.about-hero {
  color: #f5ebd9;
  background:
    radial-gradient(circle at 80% 10%, rgba(196, 154, 91, 0.28), transparent 34%),
    linear-gradient(120deg, rgba(8, 12, 22, 0.96), rgba(8, 12, 22, 0.78)),
    linear-gradient(180deg, var(--navy-900) 0%, var(--navy-800) 100%);
  position: relative;
}

.hero::after,
.about-hero::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: linear-gradient(90deg, transparent, var(--gold-500), transparent);
}

.hero-grid,
.two-col {
  display: grid;
  gap: 1.25rem;
  align-items: start;
}

.hero-grid { grid-template-columns: 1.25fr 1fr; }
.two-col { grid-template-columns: 1fr 1fr; }

.pill {
  display: inline-flex;
  border: 1px solid rgba(246, 221, 178, 0.58);
  border-radius: 999px;
  color: #f4ddb2;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.3rem 0.75rem;
  margin-bottom: 0.7rem;
}

h1 {
  margin: 0 0 0.8rem;
  color: #fff7eb;
  font-size: clamp(2rem, 5.2vw, 3.45rem);
  line-height: 1.14;
}

h2 {
  margin-top: 0;
  margin-bottom: 0.75rem;
  color: #1f2a41;
  font-size: clamp(1.45rem, 3vw, 2.25rem);
}

.hero h2,
.about-hero h2,
.hero h3,
.about-hero h3 { color: #fff7eb; }

.lead {
  color: #ddd1be;
  max-width: 62ch;
}

.quick-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1rem;
}

.quick-contact a {
  color: #f4e1bf;
  text-decoration-color: rgba(244, 225, 191, 0.5);
}

.card {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: 15px;
  padding: 1.2rem;
  box-shadow: var(--shadow);
}

.hero-card,
.hero .card,
.about-hero .card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border-color: rgba(244, 225, 191, 0.28);
  color: #f4ead8;
  box-shadow: none;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.price {
  color: var(--gold-600);
  font-weight: 800;
  font-size: 1.1rem;
  margin-bottom: 0;
}

.package-btn {
  margin-top: 0.5rem;
  width: 100%;
}

.form {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1.2rem;
  display: grid;
  gap: 0.85rem;
  box-shadow: var(--shadow);
}

label {
  display: grid;
  gap: 0.35rem;
  color: #273148;
  font-weight: 600;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #d0bea2;
  border-radius: 9px;
  padding: 0.72rem;
  font: inherit;
  color: #1f2939;
  background: #fff;
}

input:focus,
select:focus,
textarea:focus {
  outline: 2px solid rgba(196, 154, 91, 0.3);
  border-color: var(--gold-500);
}

.btn {
  display: inline-block;
  border: 0;
  border-radius: 10px;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.79rem;
  font-weight: 700;
  padding: 0.82rem 1.12rem;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(180deg, #d5b47e 0%, var(--gold-500) 100%);
  color: #2a1d11;
}

.btn-primary:hover { filter: brightness(1.04); }

.btn-secondary {
  background: transparent;
  border: 1px solid rgba(244, 225, 191, 0.58);
  color: #f7ebd5;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}

.hint {
  color: var(--muted);
  min-height: 1.2rem;
}

.pipeline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.pipeline span {
  border-radius: 999px;
  border: 1px solid #d8c6aa;
  padding: 0.35rem 0.65rem;
  font-size: 0.88rem;
  color: #6f5128;
  background: #fff;
}

.vehicle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.vehicle-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 15px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.vehicle-card img {
  width: 100%;
  height: 190px;
  object-fit: cover;
  display: block;
  background: #0e1320;
}

.vehicle-copy {
  padding: 0.9rem 1rem 1rem;
}

.owner-card img {
  width: 100%;
  max-height: 460px;
  object-fit: cover;
  border-radius: 10px;
}


.hero-photo {
  width: 100%;
  max-height: 360px;
  object-fit: cover;
  border-radius: 10px;
  display: block;
}

.hero-fallback {
  border: 1px dashed #d1bfa3;
  border-radius: 10px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  color: #625647;
}
.owner-fallback {
  border: 1px dashed #d1bfa3;
  border-radius: 10px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  color: #625647;
}

.history-copy p {
  margin-top: 0;
}

.history-copy p + p {
  margin-top: 0.8rem;
}

.text-link {
  color: #7f5b29;
  font-weight: 700;
  text-decoration-color: rgba(127, 91, 41, 0.45);
}

.site-footer {
  background: linear-gradient(180deg, #121b2d 0%, #0a1020 100%);
  color: #ecdfc8;
  border-top: 3px solid var(--gold-600);
  padding: 1.7rem 0;
}

.footer-wrap {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .hero-grid,
  .two-col {
    grid-template-columns: 1fr;
  }

  .nav {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
