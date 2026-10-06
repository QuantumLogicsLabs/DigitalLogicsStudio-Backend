# DigitalLogicsStudio Backend

Express and MongoDB backend for Boolforge / Digital Logics Studio. It provides health checks and JWT-based authentication endpoints for the frontend application.

## Tech Stack

- Node.js
- Express
- MongoDB Atlas
- Mongoose
- JWT
- bcryptjs

## Project Structure

```text
DigitalLogicsStudio-Backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   └── app.js
├── .env.example
├── server.js
├── package.json
└── README.md
```

## Environment

Create a local `.env` file from `.env.example`.

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
MONGO_URI=your-mongodb-connection-string
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
COOKIE_EXPIRES_DAYS=7
```

## Install and Run

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Run in production mode:

```bash
npm start
```

Seed the local problems database:

```bash
npm run seed:problems
```

If you are using a local MongoDB instance without a custom URI, the script will default to:

```bash
mongodb://127.0.0.1:27017/digital-logics-studio
```

## Available API Routes

- `GET /` - backend status message
- `GET /api/health` - basic health check
- `POST /api/auth/register` - create account
- `POST /api/auth/login` - log in
- `POST /api/auth/logout` - clear auth cookie
- `GET /api/auth/me` - fetch current logged-in user

## Authentication Notes

- Passwords are hashed with `bcryptjs`
- JWTs are issued by the backend
- Tokens are stored in an HTTP-only cookie
- CORS is configured to allow requests from `CLIENT_URL`

## Notes

- `.env` files are ignored; `.env.example` remains tracked
- `package-lock.json` is tracked and should stay committed
