FROM rust:1.99.1-alpine3.24 AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache musl-dev pkgconfig

# Create a dummy project to cache dependencies
RUN cargo init
COPY Cargo.toml Cargo.lock ./
# Build dependencies against the dummy main.rs created by cargo init
# --locked: build exactly the versions pinned in Cargo.lock
RUN cargo build --release --locked
RUN rm src/*.rs

# Copy source code
COPY src ./src

# Build the application
# Touch main.rs to ensure rebuild
RUN touch src/main.rs
RUN cargo build --release --locked

FROM alpine:3.24.2

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache libgcc ca-certificates \
    && addgroup -S -g 1001 relay \
    && adduser -S -u 1001 -G relay relay

COPY --from=builder /app/target/release/relay-rs .

USER relay

CMD ["./relay-rs"]
