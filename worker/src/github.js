// GitHub API client: read file via contents API, commit multi-file atomically via Git Data API.

const API = "https://api.github.com";

function cfg(env) {
  return {
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH || "main",
    token: env.GITHUB_TOKEN,
  };
}

async function gh(env, path, init = {}) {
  const { token } = cfg(env);
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "rexpand-admin-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(
      `GitHub ${init.method || "GET"} ${path}: ${r.status} ${body.slice(0, 400)}`,
    );
  }
  // 204 No Content (refs PATCH on success may still return 200 with json; keep safe)
  if (r.status === 204) return null;
  return r.json();
}

function utf8ToB64(str) {
  // Workers don't have Buffer; encode bytes manually.
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Read file at HEAD of configured branch. Returns full UTF-8 text. */
export async function readFile(env, path) {
  const { repo, branch } = cfg(env);
  const r = await gh(
    env,
    `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
  );
  return b64ToUtf8(r.content);
}

/**
 * Commit multiple files atomically via the Git Data API.
 * files: [{ path: string, content: string }, ...]
 * Returns commit SHA.
 */
export async function commitFiles(env, files, message) {
  const { repo, branch } = cfg(env);

  // 1. Latest ref → commit → tree
  const ref = await gh(env, `/repos/${repo}/git/ref/heads/${branch}`);
  const parentSha = ref.object.sha;
  const parentCommit = await gh(env, `/repos/${repo}/git/commits/${parentSha}`);
  const baseTreeSha = parentCommit.tree.sha;

  // 2. Create blobs
  const treeEntries = await Promise.all(
    files.map(async (f) => {
      const blob = await gh(env, `/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: utf8ToB64(f.content),
          encoding: "base64",
        }),
      });
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );

  // 3. New tree on top of base
  const tree = await gh(env, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });

  // 4. New commit
  const commit = await gh(env, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });

  // 5. Fast-forward branch
  await gh(env, `/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return commit.sha;
}
