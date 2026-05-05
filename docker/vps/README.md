# Paperclip VPS / Portainer Stack

This directory contains production-oriented Docker Swarm/Portainer artifacts for
running Paperclip on a VPS with the same operational shape used by the Agrelli
stacks:

- external `portainer_agent_network`
- Traefik labels on the application service
- external named volumes
- optional shared infrastructure stacks for PostgreSQL, MinIO, and Redis
- build scripts that can publish a versioned image to a private registry

The files intentionally do not contain real credentials. The stack YAML files
are self-contained with safe placeholders, so Portainer can render them without
a separate `.env`. Replace placeholder values directly in the Portainer editor
or copy `.env.example` to `docker/vps/.env` for CLI-driven deployment.

## Files

| File | Purpose |
| --- | --- |
| `paperclip-stack.yml` | Main Paperclip app stack for Swarm/Portainer |
| `infra-postgres.yml` | Shared PostgreSQL 17 stack, compatible with Paperclip `DATABASE_URL` |
| `infra-minio.yml` | Shared MinIO stack plus optional `scripts` bucket sync sidecar |
| `infra-redis.yml` | Shared Redis stack pattern matching the Agrelli VPS topology |
| `.env.example` | Optional sanitized environment template for CLI-driven deploys |

## Minimal deployment order

0. On a VPS clean directory, clone or update the project:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/marcelokarval/paperclip/local-pr-d-data-integrity-cascades/setup-paperclip-vps.sh -o setup-paperclip-vps.sh
   chmod +x setup-paperclip-vps.sh
   sudo ./setup-paperclip-vps.sh local-pr-d-data-integrity-cascades
   cd paperclip
   ```

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
   ./scripts/deploy-vps-build.sh local-pr-d-data-integrity-cascades
   # or, for a private registry:
   ./scripts/deploy-vps-build-registry.sh local-pr-d-data-integrity-cascades
   ```

5. Deploy Paperclip:

   ```sh
   ./scripts/deploy-vps-stack.sh
   ```

## Required values to replace before real production use

- `PAPERCLIP_HOST`: public hostname, for example `paperclip.example.com`
- `PAPERCLIP_PUBLIC_URL`: canonical public URL, for example `https://paperclip.example.com`
- `PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, and `BETTER_AUTH_TRUSTED_ORIGINS`: normally the same canonical URL
- `BETTER_AUTH_SECRET`: 32+ byte secret
- `POSTGRES_PASSWORD` and `DATABASE_URL`: must use the same PostgreSQL password
- `PAPERCLIP_IMAGE`: image reference, for example `registry.example.com/paperclip` or `paperclip`
- `VERSION`: image tag deployed by the stack

The YAML defaults are intentionally deployable placeholders, not production
secrets. They exist so the stack can be edited and validated in Portainer before
real values are supplied.

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
