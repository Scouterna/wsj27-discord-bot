# Discord WSJ27 Bot

A Discord bot for managing name claims with troop-based restrictions. Troops can claim unique names from a predefined list, with only one name per troop allowed.

## Features

- **40 Unique Names**: Predefined list of 40 unique names available for claiming
- **Troop-Based System**: Only users with "Troop 1" through "Troop 40" roles can participate
- **One Name Per Troop**: Each troop can only claim one name at a time
- **Name Management**: Troops can claim and return names as needed
- **Real-time Status**: View all names and their current claim status
- **Auto-complete**: Smart suggestions when using commands

## Commands

### `/take <name>`

Claim a name for your troop.

- **name**: The name you want to claim (auto-complete available)
- Only shows available names in auto-complete
- Prevents claiming if your troop already has a name
- Shows detailed success/failure messages

### `/return <name>`

Return your troop's claimed name back to the available pool.

- **name**: The name you want to return (auto-complete shows only your troop's names)
- Only the troop that claimed a name can return it
- Immediately makes the name available for other troops

### `/list [available_only]`

Show all names and their claim status.

- **available_only**: (Optional) Show only unclaimed names
- Displays troop information for claimed names
- Shows summary statistics
- Uses multiple embeds if needed (Discord field limits)

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- A Discord application/bot created at [Discord Developer Portal](https://discord.com/developers/applications)
- Bot token and client ID from your Discord application

### Installation

1. **Clone/Download the Project**

   ```bash
   cd discord-wsj27
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Environment Configuration**

   ```bash
   # Copy the example environment file
   cp .env.example .env
   ```

   Edit `.env` with your Discord bot credentials:

   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=your_guild_id_here  # Optional: for faster command deployment
   ```

4. **Deploy Slash Commands**

   ```bash
   npm run deploy
   ```

5. **Start the Bot**
   ```bash
   npm start
   ```

### Discord Server Setup

1. **Invite the Bot**

   - Go to Discord Developer Portal > Your App > OAuth2 > URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Send Messages`, `Use Slash Commands`, `Read Message History`
   - Use the generated URL to invite the bot to your server

2. **Create Troop Roles**
   Create roles named exactly:

   - `Troop 1`
   - `Troop 2`
   - ...
   - `Troop 40`

   Users must have one of these roles to use the bot.

## Project Structure

```
discord-wsj27/
├── src/
│   ├── index.js              # Main bot file
│   ├── deploy-commands.js    # Command deployment script
│   ├── storage.js            # Data persistence functions
│   ├── commands/
│   │   └── index.js          # Slash command definitions
│   └── utils/
│       └── troops.js          # Troop role utilities
├── data/
│   ├── names.json           # Static list of 40 names
│   └── claims.json          # Dynamic claims data (auto-generated)
├── package.json
├── .env.example
├── .env                     # Your environment variables
└── README.md
```

## Usage Examples

### Claiming a Name

```
User: /take Aurora
Bot: ✅ Name Claimed
     Successfully claimed "Aurora" for Troop 5

     Name: Aurora
     Troop: Troop 5
     Claimed by: username
```

### Troop Already Has a Name

```
User: /take Blaze
Bot: ❌ Claim Failed
     Your troop (Troop 5) already holds the name "Aurora"
```

### Name Already Taken

```
User: /take Aurora
Bot: ❌ Claim Failed
     Name "Aurora" is already taken by username (Troop 5)
```

### Returning a Name

```
User: /return Aurora
Bot: ✅ Name Returned
     Successfully returned "Aurora" to the available pool

     Name: Aurora
     Returned by: Troop 5
```

### Viewing All Names

```
User: /list
Bot: 📝 Names List
     Total Names: 40 | Claimed: 15 | Available: 25

     Aurora: 🔴 Claimed by username (Troop 5)
     Blaze: 🟢 Available
     Cipher: 🔴 Claimed by user2 (Troop 12)
     ...
```

## Development Scripts

- `npm start`: Start the bot
- `npm run dev`: Start with auto-restart on file changes
- `npm run deploy`: Deploy slash commands to Discord
- `npm test`: Run tests (not implemented yet)

## Data Persistence

The bot uses JSON files for data storage:

- `data/names.json`: Static list of available names (pre-populated)
- `data/claims.json`: Dynamic tracking of name claims (auto-generated)

Claims are automatically saved to disk and persist between bot restarts.

## Error Handling

- Users without troop roles receive helpful error messages
- Invalid commands are gracefully handled
- File I/O errors are logged and handled
- Discord API errors include retry logic for rate limits

## Requirements Met

✅ Static list of 40 names in a file  
✅ `/take <name>` command with autocomplete  
✅ Prevents multiple claims of the same name  
✅ `/return <name>` command with troop validation  
✅ One name per troop restriction  
✅ `/list` command showing all names and status  
✅ Troop role detection (Troop 1-40)  
✅ Troop information displayed with usernames  
✅ Troop-based claiming restrictions

## Troubleshooting

**Bot doesn't respond to commands:**

- Check if commands are deployed: `npm run deploy`
- Verify bot has necessary permissions in your server
- Check console for error messages

**"No Troop Role" error:**

- Ensure user has exactly one role named "Troop X" (where X is 1-40)
- Role names are case-sensitive

**Commands not showing up:**

- Run `npm run deploy` to register commands
- If using guild ID, commands appear instantly; global commands take up to 1 hour

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
