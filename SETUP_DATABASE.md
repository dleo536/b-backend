# PostgreSQL Database Setup Guide

## Step 1: Install PostgreSQL (if not already installed)

If you haven't installed PostgreSQL yet, download it from [postgresql.org](https://www.postgresql.org/download/) or use Homebrew on macOS:

```bash
brew install postgresql@15
brew services start postgresql@15
```

## Step 2: Set up PostgreSQL Server Connection in pgAdmin

1. **Open pgAdmin** (you should see it in your Applications or launch it from Spotlight)

2. **Set Master Password** (first time only):
   - pgAdmin will ask you to set a master password to protect saved passwords
   - This is different from your PostgreSQL password - remember this!

3. **Add PostgreSQL Server**:
   - Right-click on "Servers" in the left panel
   - Select "Create" → "Server..."
   - In the "General" tab:
     - **Name**: `bsides-local` (or any name you prefer)
   - In the "Connection" tab:
     - **Host name/address**: `localhost`
     - **Port**: `5432` (default PostgreSQL port)
     - **Maintenance database**: `postgres`
     - **Username**: `postgres` (default superuser)
     - **Password**: Enter your PostgreSQL password (set during installation)
     - Check "Save password" if you want pgAdmin to remember it
   - Click "Save"

## Step 3: Create the Database

1. **Expand your server** in the left panel (e.g., "bsides-local")

2. **Right-click on "Databases"** → Select "Create" → "Database..."

3. **Database Configuration**:
   - **Database name**: `bsides_db` (or match `DB_NAME` in your .env)
   - **Owner**: `postgres` (or your PostgreSQL username)
   - Leave other settings as default
   - Click "Save"

## Step 4: Create a .env File

1. **Navigate to your b-backend directory**:
   ```bash
   cd /Users/dannyleo/Workspace/bsides-backend/b-backend
   ```

2. **Create a .env file** (copy from .env.example):
   ```bash
   cp .env.example .env
   ```

3. **Edit the .env file** with your database credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=your_actual_postgres_password
   DB_NAME=bsides_db
   PORT=3000
   ```

   Replace `your_actual_postgres_password` with the password you set during PostgreSQL installation.

## Step 5: Verify Database Connection

1. **In pgAdmin**, expand your server → Databases → `bsides_db`
2. You should see the database is empty (no tables yet)
3. This is expected - TypeORM will create tables automatically when you start the app

## Step 6: Start Your NestJS Application

1. **Make sure you're in the b-backend directory**:
   ```bash
   cd /Users/dannyleo/Workspace/bsides-backend/b-backend
   ```

2. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run start:dev
   ```

4. **Watch for database connection**:
   - If successful, you should see the app start without database errors
   - TypeORM will automatically create tables based on your entities (User, Review, AlbumList)
   - Check pgAdmin → `bsides_db` → Schemas → public → Tables to see the created tables

## Troubleshooting

### "Password authentication failed"
- Verify your PostgreSQL password in the .env file
- Try resetting PostgreSQL password:
  ```bash
  # On macOS with Homebrew
  psql postgres
  ALTER USER postgres PASSWORD 'new_password';
  ```

### "Connection refused" or "Could not connect"
- Make sure PostgreSQL is running:
  ```bash
  # Check status
  brew services list
  
  # Start if not running
  brew services start postgresql@15
  ```

### "Database does not exist"
- Make sure you created the database in pgAdmin (Step 3)
- Verify the `DB_NAME` in your .env matches the database name

### "Permission denied"
- Make sure your PostgreSQL user has permissions to create tables
- The default `postgres` user should have all permissions

## Next Steps

Once your database is set up and the app is running:

1. **Verify tables were created**: Check pgAdmin → `bsides_db` → Schemas → public → Tables
   - You should see: `user`, `reviews`, `album_lists`

2. **Test the API**: Try making requests to your endpoints:
   ```bash
   # Create a user
   curl -X POST http://localhost:3000/users \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"test123","email":"test@example.com"}'
   ```

3. **View data in pgAdmin**: Right-click on a table → "View/Edit Data" → "All Rows"

## Important Notes

- **`synchronize: true`** is enabled in `app.module.ts`, which means TypeORM will automatically create/update tables based on your entities
- This is fine for development, but **disable it in production** and use migrations instead
- Your database password should be kept secure and never committed to git (the .env file should be in .gitignore)


