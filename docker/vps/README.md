# Paperclip VPS / Portainer Stack

This directory contains production-oriented Docker Swarm/Portainer artifacts for
running Paperclip on a VPS with the same operational shape used by the Agrelli
stacks:

- external `portainer_agent_network`
- Traefik labels on the application service
- external named volumes
- optional shared infrastructure stacks for PostgreSQL, MinIO, and Redis
- build scripts that can publish a versioned image to a private registry

The files intentionally do not contain real credentials. Copy
`.env.example` to a private `.env` file on the VPS or define these variables in
Portainer stack environment settings.

## Files

| File | Purpose |
| --- | --- |
| `paperclip-stack.yml` | Main Paperclip app stack for Swarm/Portainer |
| `infra-postgres.yml` | Shared PostgreSQL 17 stack, compatible with Paperclip `DATABASE_URL` |
| `infra-minio.yml` | Shared MinIO stack plus optional `scripts` bucket sync sidecar |
| `infra-redis.yml` | Shared Redis stack pattern matching the Agrelli VPS topology |
| `.env.example` | Sanitized environment template for all stacks |

## Minimal deployment order

1. Create the external network once:

   ```sh
   docker network create --driver overlay --attachable portainer_agent_network
   ```

2. Create external volumes once:

   ```sh
   docker volume create postgres_data
   docker volume create minio_data
   docker volume create checkout_scripts
   docker volume create paperclip_data
   ```

3. Deploy infrastructure stacks in Portainer or CLI:

   ```sh
   docker stack deploy -c docker/vps/infra-postgres.yml postgres
   docker stack deploy -c docker/vps/infra-minio.yml minio
   ```

4. Build and publish the app image:

   ```sh
   ./scripts/deploy-vps-build-registry.sh
   ```

5. Deploy Paperclip:

   ```sh
   ./scripts/deploy-vps-stack.sh
   ```

## Required Paperclip env

- `PAPERCLIP_HOST`: public hostname, for example `paperclip.example.com`
- `PAPERCLIP_PUBLIC_URL`: canonical public URL, for example `https://paperclip.example.com`
- `BETTER_AUTH_SECRET`: 32+ byte secret
- `POSTGRES_PASSWORD`: PostgreSQL password used by `infra-postgres.yml`
- `PAPERCLIP_IMAGE`: image reference, for example `registry.example.com/paperclip`
- `VERSION`: image tag deployed by the stack

## Optional MinIO / S3 storage env

Paperclip can use local disk storage or S3-compatible storage. For MinIO:

```sh
PAPERCLIP_STORAGE_PROVIDER=s3
PAPERCLIP_STORAGE_S3_BUCKET=paperclip
PAPERCLIP_STORAGE_S3_REGION=us-east-1
PAPERCLIP_STORAGE_S3_ENDPOINT=http://minio:9000
PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Use `local_disk` if you want to keep assets inside the `paperclip_data` volume.

## Notes

- Redis is provided because it exists in the real VPS topology, but current
  Paperclip core does not require Redis for normal operation.
- PostgreSQL is intentionally shared-service compatible. If the database service
  name differs from `postgres`, override `DATABASE_URL` in the Paperclip stack.
- Do not commit real `.env` files or registry credentials.
