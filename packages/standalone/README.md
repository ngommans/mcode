# Terminal Code (tcode) - NPX Package

Run the Terminal Code (tcode) web interface via npx.

## Usage

```bash
# Run directly with npx
npx tcode

# Or install globally
npm install -g tcode
tcode
```

## Options

- `PORT` - Set custom port (default: 3000)
- `HEADLESS` - Disable auto-opening browser

## Examples

```bash
# Run on custom port
PORT=8080 npx tcode

# Run without opening browser
HEADLESS=1 npx tcode
```

The Terminal Code web client will be available at `http://localhost:3000` (or your custom port).