import { describe, expect, it } from "vitest";
import { credentialPath } from "./credential-paths.ts";

describe("credentialPath", () => {
  it.each([
    [".env.local", "an environment file"],
    [".env", "an environment file"],
    [".ENV.Production", "an environment file"],
    ["config/prod.env", "an environment file"],
    ["files/docs/server.pem", "a key or certificate file"],
    ["deploy/signing.KEY", "a key or certificate file"],
    ["certs/client.p12", "a key or certificate file"],
    ["id_rsa", "an SSH identity"],
    ["home/id_ed25519.pub", "an SSH identity"],
    [".npmrc", "a saved login"],
    ["_netrc", "a saved login"],
    [".git-credentials", "a saved login"],
    ["credentials", "a credentials file"],
    ["gcp/credentials.json", "a credentials file"],
    ["aws.credentials", "a credentials file"],
    ["secrets.yaml", "a credentials file"],
    ["client_secret_1234.json", "a credentials file"],
    [".ssh/config", "a credentials folder, or inside one"],
    ["files\\.aws\\config", "a credentials folder, or inside one"],
    ["files/.ssh", "a credentials folder, or inside one"],
  ])("refuses %s as %s", (rel, why) => {
    expect(credentialPath(rel)).toBe(why);
  });

  it.each([
    "knowledge/notes/environment-variables.md",
    "files/docs/keynote-slides.pdf",
    "files/images/2026-09/a1b2-photo.png",
    "tasks/2026-09-10-renew-ssh-keys.md",
    "knowledge/collections/secret-santa-ideas.md",
    "lib/security/secrets.ts",
    "README.md",
    "files/docs/.aws-notes.md",
    "knowledge/notes/idea.md",
  ])("lets %s through", (rel) => {
    expect(credentialPath(rel)).toBeNull();
  });
});
