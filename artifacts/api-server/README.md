# Airwave API Server

WebSocket signaling server for Airwave audio broadcasting.

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)
- PostgreSQL database

## Setup

### 1. Install Dependencies

```bash
cd api-server
npm install
# or
pnpm install
```

### 2. Environment Variables

Create a `.env` file in the api-server directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/airwave
PORT=3000
NODE_ENV=development
```

### 3. Database Setup

Make sure PostgreSQL is running and you have a database created:

```bash
# Create database (if needed)
createdb airwave

# Run migrations (if using drizzle)
npm run migrate
# or
pnpm migrate
```

### 4. Build

```bash
npm run build
# or
pnpm build
```

### 5. Run

**Development:**
```bash
npm run dev
# or
pnpm dev
```

**Production:**
```bash
npm run start
# or
pnpm start
```

The server will start on `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms` | List active rooms |
| GET | `/api/rooms/:code` | Get room details |
| POST | `/api/rooms/:code/end` | End a room |
| GET | `/api/stats` | Get live stats |
| GET | `/health` | Health check |

## WebSocket

Connect to `/ws` for real-time communication.

### Client Types

| Type | Message |
|------|---------|
| Browser Host | `{ "type": "host", "code": "ROOM123", "hostToken": "..." }` |
| Python Host (FLAC) | `{ "type": "flac-host-connect", "code": "ROOM123", "hostToken": "..." }` |
| Browser Listener | `{ "type": "listener", "code": "ROOM123" }` |
| Python Listener (FLAC) | `{ "type": "flac-listener", "code": "ROOM123" }` |

### Binary Messages

- **FLAC audio**: Binary audio data sent directly from Python host to listeners

## Features

- WebRTC signaling for browser-based broadcasting
- FLAC audio streaming support (96kHz 24-bit stereo)
- Room management with authentication
- Real-time listener count updates
- Relay FLAC audio from Python host to browser listeners

## Tech Stack

- Express.js
- WebSocket (ws)
- Drizzle ORM
- PostgreSQL
- TypeScript