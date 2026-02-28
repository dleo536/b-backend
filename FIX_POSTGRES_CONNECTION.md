# Fix PostgreSQL Connection Issue

## Problem
The error "role 'postgres' does not exist" occurs because Homebrew PostgreSQL uses your macOS username as the default database user, not "postgres".

## Solution: Update Your .env File

Your `.env` file should use your macOS username (`dannyleo`) instead of `postgres`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=dannyleo
DB_PASSWORD=
DB_NAME=bsides_db
PORT=3000
```

**Note**: If you haven't set a password for your PostgreSQL user, you can leave `DB_PASSWORD` empty, or set one using the steps below.

## Steps to Fix

### 1. Update .env File
Edit `/Users/dannyleo/Workspace/bsides-backend/b-backend/.env` and change:
- `DB_USERNAME=postgres` → `DB_USERNAME=dannyleo`
- `DB_PASSWORD=your_password_here` → `DB_PASSWORD=` (empty if no password set)

### 2. Update pgAdmin Connection
In pgAdmin, when creating/editing your server connection:
- **Username**: `dannyleo` (not `postgres`)
- **Password**: Leave empty if you haven't set one, or use your password

### 3. (Optional) Set a Password for Your User
If you want to set a password for better security:

```bash
# Connect to PostgreSQL
psql postgres

# Set password for your user
ALTER USER dannyleo PASSWORD 'your_new_password';

# Exit
\q
```

Then update your `.env`:
```env
DB_PASSWORD=your_new_password
```

### 4. (Alternative) Create a "postgres" Role
If you prefer to use "postgres" as the username:

```bash
# Connect to PostgreSQL
psql postgres

# Create the postgres role
CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'your_password';

# Exit
\q
```

Then you can use `DB_USERNAME=postgres` in your `.env`.

## Verify Connection

After updating your `.env`, try connecting in pgAdmin again with:
- **Host**: localhost
- **Port**: 5432
- **Username**: dannyleo
- **Password**: (empty or your password)
- **Database**: postgres (for initial connection)

Then create your `bsides_db` database as described in SETUP_DATABASE.md.


