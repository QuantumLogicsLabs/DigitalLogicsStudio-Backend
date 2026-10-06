# Backend API Documentation

Base URL:

- Local: `http://localhost:5000`
- Production: configured deployment domain

All API responses are JSON. Successful responses include `success: true`; errors include `success: false` and `message`.

## Authentication Model

Authentication uses an httpOnly cookie named `token`. The frontend must call the API with credentials enabled:

```js
axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  withCredentials: true
});
```

Do not send JWTs through localStorage or manually attach bearer tokens unless the auth model is intentionally changed.

## Health

### `GET /`

Returns a service status message.

```json
{
  "success": true,
  "message": "Digital Logics Studio backend is running."
}
```

### `GET /api/health`

Returns API health and environment.

```json
{
  "success": true,
  "message": "API is healthy",
  "environment": "development"
}
```

## Auth Endpoints

### `POST /api/auth/register`

Creates a user, hashes the password, sets the auth cookie, and returns sanitized user data.

Request:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "correcthorse"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Account created successfully.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "solvedProblems": [],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

Validation:

- `name` required, minimum 2 characters.
- `email` required and normalized to lowercase.
- `password` required, minimum 8 characters.
- Duplicate email returns `409`.

### `POST /api/auth/login`

Verifies credentials, sets the auth cookie, and returns sanitized user data.

Request:

```json
{
  "email": "ada@example.com",
  "password": "correcthorse"
}
```

Response `200`:

```json
{
  "success": true,
  "message": "Welcome back, Ada Lovelace.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "solvedProblems": [1, 7],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

### `POST /api/auth/logout`

Clears the auth cookie.

Response `200`:

```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

### `GET /api/auth/me`

Requires a valid auth cookie.

Response `200`:

```json
{
  "success": true,
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "solvedProblems": [1, 7],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

Unauthorized response `401`:

```json
{
  "success": false,
  "message": "Kindly log in or sign up for a better experience and to save your progress."
}
```

## Progress Endpoints

All progress routes require authentication.

### `GET /api/progress` and `GET /api/progress/snapshot`

Returns the complete progress state used by the frontend.

Response:

```json
{
  "success": true,
  "state": {
    "problems": {
      "5": {
        "attempts": 2,
        "status": "solved",
        "openedAt": "2026-05-29T10:00:00.000Z",
        "lastAttemptAt": "2026-05-29T10:05:00.000Z",
        "solvedAt": "2026-05-29T10:05:00.000Z",
        "title": "Half Adder",
        "tags": ["Combinational", "Arithmetic"],
        "topicId": "arithmetic"
      }
    },
    "topics": {},
    "activity": {},
    "recentEvents": []
  }
}
```

### `POST /api/progress/problems/:problemId/attempt`

Records an attempt and increments daily activity.

Request:

```json
{
  "title": "Half Adder",
  "tags": ["Combinational", "Arithmetic"],
  "topicId": "arithmetic"
}
```

Response:

```json
{
  "success": true,
  "message": "Attempt recorded."
}
```

### `POST /api/progress/problems/:problemId/complete`

Marks a problem as solved. This operation is idempotent for daily solved counts.

Request:

```json
{
  "title": "Half Adder",
  "tags": ["Combinational", "Arithmetic"],
  "topicId": "arithmetic"
}
```

Response:

```json
{
  "success": true,
  "message": "Problem marked as completed.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "solvedProblems": [5],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

### `POST /api/progress/problems/:problemId/uncomplete`

Removes a problem from solved state.

Response:

```json
{
  "success": true,
  "message": "Problem un-marked.",
  "user": {
    "id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "solvedProblems": [],
    "createdAt": "2026-05-29T10:00:00.000Z"
  }
}
```

### `POST /api/progress/topics/:topicId/open`

Marks a topic as opened and stores total subtopic count.

Request:

```json
{
  "title": "Boolean Algebra",
  "totalSubtopics": 8
}
```

### `POST /api/progress/topics/:topicId/subtopics/:subtopicId`

Toggles a subtopic completion state.

Request:

```json
{
  "title": "Boolean Algebra",
  "totalSubtopics": 8,
  "equivalentSubtopicIds": ["boolean-laws-legacy"]
}
```

Response:

```json
{
  "success": true,
  "message": "Subtopic toggled.",
  "topicProgress": {
    "topicId": "boolean-algebra",
    "title": "Boolean Algebra",
    "status": "in_progress",
    "completionPercentage": 13,
    "completedSubtopics": ["boolean-laws"],
    "totalSubtopics": 8
  }
}
```

## Error Responses

Development errors include `stack`; production errors do not.

```json
{
  "success": false,
  "message": "Route not found: /missing"
}
```

