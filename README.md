# JECS Quick Wash - Admin Portal

A modern React-based admin dashboard for managing car wash bookings, customer data, and service requests.

## Features

✅ **Dashboard Overview** - Key metrics and recent activity
✅ **Customers Management** - View, edit, and manage customer records
✅ **Appointments** - Track and manage car wash appointments
✅ **Service Requests** - Handle special service inquiries
✅ **Employees** - Manage staff profiles
✅ **Profiles** - User profile management
✅ **Subscriptions** - Track customer subscriptions
✅ **Real-time Search** - Filter records instantly
✅ **CRUD Operations** - Create, read, edit, and archive records
✅ **Schema Discovery** - Automatic column detection

## Quick Start

### Prerequisites
- Node.js 14+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

## Authentication

The admin portal uses email-based authentication. Only authorized emails can access the dashboard:

- `concierge@jubileeexecutivecarservice.com`
- `contact@jubileeexecutivecarservice.com`
- `aarmstrong1234@gmail.com`

## Database

Connects to Supabase for real-time data management. The following tables are supported:

- customers
- appointments
- service_requests
- employees
- profiles
- subscriptions

## Tech Stack

- **React 18** - UI framework
- **Supabase** - Backend & database
- **Inline Styles** - No CSS framework, pure React styling
- **SVG Icons** - Lightweight icon set

## Architecture

The app uses a single-file component architecture with:

- **Design Tokens** - Centralized color and style definitions
- **Helper Functions** - Smart column formatting and detection
- **Generic Table View** - Reusable component for all tables
- **Modal System** - Create/edit records with form validation
- **Dashboard Tab** - Overview with metrics and recent activity

## Project Structure

```
src/
├── App.jsx           # Main application component
├── index.js          # React entry point
public/
├── index.html        # HTML template
package.json          # Dependencies and scripts
```

## Support

For issues or feature requests, please contact the development team.
