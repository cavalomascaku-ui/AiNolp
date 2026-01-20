import { GitHubUser, GitHubRepo, ProjectFiles } from '../types';

const API_BASE = 'https://api.github.com';

export const validateGitHubToken = async (token: string): Promise<GitHubUser | null> => {
    try {
        const res = await fetch(`${API_BASE}/user`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
};

export const getUserRepos = async (token: string, page = 1): Promise<GitHubRepo[]> => {
    try {
        const res = await fetch(`${API_BASE}/user/repos?sort=updated&per_page=100&page=${page}&type=owner`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        return [];
    }
};

interface GitTreeItem {
    path: string;
    mode: '100644';
    type: 'blob';
    sha?: string;
    content?: string;
}

// Push logic using Low-Level Git Data API for atomic multi-file commits
export const pushToGitHub = async (
    token: string,
    owner: string,
    repo: string,
    branch: string,
    files: ProjectFiles,
    message: string
): Promise<{ success: boolean; url?: string; error?: string }> => {
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    };

    try {
        // 1. Get Reference to branch (latest commit SHA)
        const refRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers });
        let latestCommitSha = '';
        
        if (refRes.status === 404) {
             // Branch doesn't exist? Check if repo is empty.
             // If completely empty, we need to create an initial commit without a parent.
             // But usually user selects an existing repo.
             // Let's assume repo is init'd. If not, this is complex.
             return { success: false, error: `Branch '${branch}' não encontrada. Inicialize o repo primeiro.` };
        } else if (!refRes.ok) {
             throw new Error("Falha ao obter branch info");
        } else {
             const refData = await refRes.json();
             latestCommitSha = refData.object.sha;
        }

        // 2. Get the commit object to get the tree SHA
        const commitRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { headers });
        const commitData = await commitRes.json();
        const baseTreeSha = commitData.tree.sha;

        // 3. Create Blobs for each file (Optional, but safer for binary/large text) 
        // OR just send content directly in the Tree if text. 
        // Using direct content in tree for simplicity of this agent.
        
        const treeItems: GitTreeItem[] = Object.entries(files).map(([path, content]) => ({
            path,
            mode: '100644',
            type: 'blob',
            content: content
        }));

        // 4. Create a new Tree
        const treeRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/trees`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                base_tree: baseTreeSha,
                tree: treeItems
            })
        });
        
        if (!treeRes.ok) throw new Error("Falha ao criar Git Tree");
        const treeData = await treeRes.json();
        const newTreeSha = treeData.sha;

        // 5. Create a new Commit
        const newCommitRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/commits`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                message: message || "Update via DevGame AI",
                tree: newTreeSha,
                parents: [latestCommitSha]
            })
        });

        if (!newCommitRes.ok) throw new Error("Falha ao criar Commit");
        const newCommitData = await newCommitRes.json();
        const newCommitSha = newCommitData.sha;

        // 6. Update the Reference (Push)
        const updateRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                sha: newCommitSha,
                force: false // Be safe
            })
        });

        if (!updateRes.ok) throw new Error("Falha ao atualizar Branch (Push)");
        
        return { success: true, url: `https://github.com/${owner}/${repo}/tree/${branch}` };

    } catch (e: any) {
        console.error(e);
        return { success: false, error: e.message || "Erro desconhecido no push" };
    }
};