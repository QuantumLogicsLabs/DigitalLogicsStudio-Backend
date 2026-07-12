# DigitalLogicsStudio Backend

Express and MongoDB backend for Boolforge / Digital Logics Studio. It provides health checks, JWT-based authentication, and a Quantum code execution endpoint for the frontend application.

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
│   ├── services/
│   ├── utils/
│   └── app.js
├── bin/            # qrun / quantum binaries (not committed)
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

# Quantum execution
QUANTUM_BIN=./bin/qrun
EXEC_TIMEOUT_MS=5000
EXEC_TMP_DIR=./tmp
EXEC_MAX_CODE_BYTES=100000
EXEC_MAX_OUTPUT_BYTES=1000000
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

## Available API Routes

- `GET /` - backend status message
- `GET /api/health` - basic health check
- `POST /api/auth/register` - create account
- `POST /api/auth/login` - log in
- `POST /api/auth/logout` - clear auth cookie
- `GET /api/auth/me` - fetch current logged-in user
- `POST /api/execute` - run Quantum `.sa` code and return the result

## Code Execution: POST /api/execute

Executes Quantum (`.sa`) source code using the `qrun` interpreter and returns the result.

**Request body**

```json
{ "ext": ".sa", "code": "print(1)" }
```

| Field | Type   | Description                               |
| ----- | ------ | ----------------------------------------- |
| ext   | string | File extension. Only `.sa` is accepted.   |
| code  | string | The Quantum source code to run. Required. |

**Response body**

```json
{
  "success": true,
  "output": "1\n",
  "hasWarnings": false,
  "error": null,
  "compilerError": null
}
```

| Field         | Type           | Description                                      |
| ------------- | -------------- | ------------------------------------------------ |
| success       | boolean        | `true` if the code ran to completion.            |
| output        | string         | Program stdout (ANSI codes stripped).            |
| hasWarnings   | boolean        | `true` if the interpreter emitted warnings.      |
| error         | string \| null | Runtime or execution error message, else `null`. |
| compilerError | string \| null | Parse/compile error message, else `null`.        |

**Behaviour notes**

- Empty or missing `code` returns HTTP `400` with `error: "Code cannot be empty"`.
- Compile/parse failures populate `compilerError`; runtime failures populate `error`.
- Execution is capped by `EXEC_TIMEOUT_MS`; runaway loops are also stopped by the interpreter's own step limit.
- Requires the `qrun` binary at the path set by `QUANTUM_BIN`. The binary is platform-specific and **not committed** to the repo; provide it per environment.

## Authentication Notes

- Passwords are hashed with `bcryptjs`
- JWTs are issued by the backend
- Tokens are stored in an HTTP-only cookie
- CORS is configured to allow requests from `CLIENT_URL`

## Notes

- `.env` files are ignored; `.env.example` remains tracked
- `bin/` and `tmp/` are ignored (platform binaries and temporary run files)
- `package-lock.json` is tracked and should stay committed
