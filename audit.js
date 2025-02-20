const https = require("https");

class PluginAuditor {
  constructor(githubToken = null) {
    this.githubToken = githubToken;
  }

  /**
   * Make an HTTPS request
   * @param {string} url - The URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Parsed JSON response
   */
  makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const headers = {
        "User-Agent": "Maiar-Plugin-Auditor",
        ...options.headers,
      };

      if (this.githubToken && url.includes("api.github.com")) {
        headers["Authorization"] = `token ${this.githubToken}`;
      }

      const req = https.get(url, { headers }, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject({
              status: res.statusCode,
              message: data,
              response: { status: res.statusCode },
            });
            return;
          }

          try {
            resolve({
              data: JSON.parse(data),
              status: res.statusCode,
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * Audit a plugin submission
   * @param {Object} submission - The plugin submission object
   * @param {string} submission.repo - The repository name
   * @param {string} submission.owner - The GitHub username or organization
   * @param {string} submission.npm_package_name - The npm package name
   * @returns {Promise<{ passed: boolean, issues: string[] }>}
   */
  async auditPlugin(submission) {
    const issues = [];
    let repoData = null;
    let npmData = null;

    try {
      // Check if all required fields are present
      if (
        !submission.repo ||
        !submission.owner ||
        !submission.npm_package_name
      ) {
        issues.push("Missing required fields in submission");
        return { passed: false, issues };
      }

      // Fetch GitHub repository data
      try {
        const repoResponse = await this.makeRequest(
          `https://api.github.com/repos/${submission.owner}/${submission.repo}`
        );
        repoData = repoResponse;
      } catch (error) {
        if (error.response?.status === 404) {
          issues.push("GitHub repository not found");
        } else if (error.response?.status === 403) {
          issues.push("GitHub repository is not public");
        } else {
          issues.push(`Error accessing GitHub repository: ${error.message}`);
        }
        return { passed: false, issues };
      }

      // Check if repository is public
      if (repoData.data.private) {
        issues.push("Repository must be public");
      }

      // Check repository description
      if (
        !repoData.data.description ||
        repoData.data.description.trim().length < 10
      ) {
        issues.push(
          "Repository must have a clear, descriptive description (minimum 10 characters)"
        );
      }

      // Check repository topics
      try {
        const topicsResponse = await this.makeRequest(
          `https://api.github.com/repos/${submission.owner}/${submission.repo}/topics`,
          {
            headers: {
              Accept: "application/vnd.github.mercy-preview+json",
            },
          }
        );

        if (!topicsResponse.data.names.includes("maiar")) {
          issues.push('Repository must have the "maiar" topic tagged');
        }
      } catch (error) {
        issues.push(`Error checking repository topics: ${error.message}`);
        return { passed: false, issues };
      }

      // Check npm package
      try {
        const npmResponse = await this.makeRequest(
          `https://registry.npmjs.org/${encodeURIComponent(
            submission.npm_package_name
          )}`
        );
        npmData = npmResponse.data;
      } catch (error) {
        if (error.response?.status === 404) {
          issues.push("npm package not found");
        } else {
          issues.push(`Error accessing npm package: ${error.message}`);
        }
        return { passed: false, issues };
      }

      // Check if npm package is public
      if (npmData.private) {
        issues.push("npm package must be public");
      }

      // Check repository URL in package.json matches GitHub repository
      const normalizedRepoUrl = this.normalizeRepositoryUrl(npmData.repository);

      if (
        !normalizedRepoUrl.includes(`${submission.owner}/${submission.repo}`)
      ) {
        issues.push("npm package repository URL must match GitHub repository");
      }
    } catch (error) {
      issues.push(`Unexpected error during audit: ${error.message}`);
    }

    return {
      passed: issues.length === 0,
      issues,
      metadata: {
        github: repoData
          ? {
              name: repoData.data.name,
              owner: repoData.data.owner.login,
              fullName: repoData.data.full_name,
              stars: repoData.data.stargazers_count,
              description: repoData.data.description,
              topics: repoData.data.topics,
              lastUpdated: repoData.data.updated_at,
            }
          : null,
        npm: npmData
          ? {
              name: submission.npm_package_name,
              version: npmData["dist-tags"].latest,
              lastPublished: npmData.time.modified,
              author: npmData.author,
              maintainers: npmData.maintainers,
            }
          : null,
      },
    };
  }

  /**
   * Normalize repository URL to a standard format
   * @param {string|Object} repository - Repository URL or object from package.json
   * @returns {string} Normalized repository URL
   */
  normalizeRepositoryUrl(repository) {
    if (!repository) return "";
    if (typeof repository === "string") return repository;
    if (typeof repository === "object" && repository.url) return repository.url;
    return "";
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node audit.js <submission-json>");
    console.log(
      'Example: node audit.js \'{"repo": "my-plugin", "owner": "username", "npm_package_name": "my-package"}\''
    );
    process.exit(1);
  }

  const submission = JSON.parse(process.argv[2]);
  const githubToken = process.env.GITHUB_TOKEN; // Optional now
  const auditor = new PluginAuditor(githubToken);

  try {
    console.log("\nRunning audit...");
    if (!githubToken) {
      console.log(
        "Note: Running without GitHub token. Rate limits will be stricter."
      );
    }

    const result = await auditor.auditPlugin(submission);

    console.log("\nPlugin Information:");
    console.log("==================");
    if (result.metadata.github) {
      console.log(`Repository: ${result.metadata.github.fullName}`);
      console.log(`Owner: ${result.metadata.github.owner}`);
    }
    if (result.metadata.npm) {
      console.log(`NPM Package: ${result.metadata.npm.name}`);
      console.log(
        `Author: ${
          typeof result.metadata.npm.author === "object"
            ? result.metadata.npm.author.name
            : result.metadata.npm.author
        }`
      );
    }

    console.log("\nAudit Results:");
    console.log("=============");
    console.log(`Status: ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);

    if (result.issues.length > 0) {
      console.log("\nIssues Found:");
      result.issues.forEach((issue) => console.log(`- ${issue}`));
    }

    if (result.metadata) {
      console.log("\nDetailed Metadata:");
      console.log(JSON.stringify(result.metadata, null, 2));
    }
  } catch (error) {
    console.error("Error running audit:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PluginAuditor;
