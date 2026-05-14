# 📧 Gmail Automation Extension

A full-stack Chrome Extension for bulk Gmail automation with a beautiful dark-mode dashboard, CSV upload, rich text editor, scheduling, and real-time progress tracking.

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js + Tailwind CSS |
| Backend | Node.js + Express.js |
| Email | Nodemailer (Gmail SMTP) |
| Database | MongoDB (via Mongoose) |
| Extension | Chrome Manifest V3 |
| Deployment | Render (backend) + Vercel (frontend) |

---

## 📁 Folder Structure

```
gmail-automation-extension/
├── client/          # React.js frontend dashboard
├── server/          # Node.js + Express.js backend
├── extension/       # Chrome Extension (Manifest V3)
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/yourname/gmail-automation-extension.git
cd gmail-automation-extension
```

### 2. Backend Setup
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### 3. Frontend Setup
```bash
cd client
npm install
cp .env.example .env
npm start
```

### 4. Load Chrome Extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `/extension` folder

---

## 🔐 Environment Variables

### Server `.env`
```env
PORT=5000
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster.mongodb.net/gmail-automation
GMAIL_USER=youremail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
JWT_SECRET=your_super_secret_jwt_key
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### Client `.env`
```env
REACT_APP_API_URL=http://localhost:5000/api
```

---

## 🔑 Gmail App Password Setup

1. Go to [Google Account](https://myaccount.google.com/)
2. Security → 2-Step Verification → Enable
3. Security → App Passwords
4. Select **Mail** + **Windows Computer**
5. Copy the 16-character password into `.env`

---

## 📡 API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/email/send` | Send single email |
| POST | `/api/email/send-bulk` | Send bulk emails (queue) |
| GET | `/api/email/history` | Get email history |
| POST | `/api/email/stop` | Stop sending queue |
| GET | `/api/email/status` | Get queue status |
| POST | `/api/template/save` | Save email template |
| GET | `/api/template/list` | List templates |
| POST | `/api/schedule/create` | Schedule emails |
| GET | `/api/report/export` | Export CSV report |
| PUT | `/api/settings` | Update SMTP settings |

---

## 🛡️ Security Best Practices

- Gmail App Passwords (never store raw passwords)
- Rate limiting on all API routes (express-rate-limit)
- Helmet.js for HTTP security headers
- CORS restricted to known origins
- Input validation with express-validator
- Environment variables via dotenv
- No secrets in source code

---

## ☁️ Deployment

### Backend on Render
1. Push to GitHub
2. New Web Service → Connect repo → Select `/server`
3. Build: `npm install` | Start: `npm start`
4. Add environment variables in Render dashboard

### Frontend on Vercel
1. Import repo on [vercel.com](https://vercel.com)
2. Root Directory: `client`
3. Set `REACT_APP_API_URL` to your Render backend URL
4. Deploy

---

## ✨ Features

- ✅ Bulk email sending with queue
- ✅ CSV upload for recipient list
- ✅ Rich text editor with placeholders
- ✅ Personalization: `{{name}}`, `{{company}}`, etc.
- ✅ Send delay (2–5 seconds)
- ✅ Progress bar + real-time logs
- ✅ Stop / Resume sending
- ✅ Attachment support
- ✅ Email templates
- ✅ Schedule emails
- ✅ Dark mode UI
- ✅ Export CSV reports
- ✅ Chrome extension popup
- ✅ Toast notifications
- ✅ Email history dashboard

---

## 📄 License

ARG © 2026 Gmail Automation Extension
