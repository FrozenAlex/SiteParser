# A simple authenticated proxy server 
![Node.js CI](https://github.com/FrozenAlex/SiteParser/workflows/Node.js%20CI/badge.svg)

## Environment variables

The application receives following parameters

```bash
# Credentials for the website
USERNAME="Username"
PASSWORD="Password"
DB_TYPE="mysql"
DB_NAME="auth"
DB_HOST="localhost"
DB_PORT=3306
DB_USER="user"
DB_PASSWORD="password"
BOT_TOKEN="token for the telegram bot" # not optional
HOSTNAME="example.com" # optional
SECRET_PATH="secretpathfortelegramwebhook" # random if not set
ADMIN_USERNAME="admin" # telegram username of super admin (can't be deauthorized)
```
