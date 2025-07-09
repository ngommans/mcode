# Production Dockerfile for tcode (npm-based)
FROM node:22-alpine

WORKDIR /app

# Install tcode globally from npm
RUN npm install -g tcode@latest

# Set default port (can be overridden)
ENV PORT=3000

# Expose the port
EXPOSE $PORT

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/ || exit 1

# Install curl for healthcheck
RUN apk add --no-cache curl

# Run tcode
CMD ["npx", "tcode"]