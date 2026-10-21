FROM rust:alpine as builder


WORKDIR /app

# Install dependencies
RUN apk add --no-cache musl-dev openssl-dev pkgconfig

# Create a dummy project to cache dependencies
RUN cargo init
COPY Cargo.toml Cargo.lock ./
# Build dependencies (this will fail if main.rs is missing, but cargo init created it)
# --locked: build exactly the pinned versions (the unpinned negentropy 0.3 resolution was yanked)
RUN cargo build --release --locked
RUN rm src/*.rs

# Copy source code
COPY src ./src

# Build the application
# Touch main.rs to ensure rebuild
RUN touch src/main.rs
RUN cargo build --release --locked

FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache libgcc openssl ca-certificates

COPY --from=builder /app/target/release/relay-rs .

CMD ["./relay-rs"]
