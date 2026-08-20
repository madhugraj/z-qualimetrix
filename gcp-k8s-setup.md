# GCP Kubernetes (GKE) Setup Guide

Complete steps to authenticate gcloud and connect to a GKE cluster.

## Prerequisites

- Google Cloud account with access to a GKE cluster
- Linux/macOS environment

## 1. Install Google Cloud SDK

```bash
curl https://sdk.cloud.google.com | bash
```

This installs gcloud to `~/google-cloud-sdk/`.

## 2. Authenticate with Google

```bash
~/google-cloud-sdk/bin/gcloud auth login
```

This opens a browser window where you sign in to your Google account.

## 3. Set Default Project

First, list available projects:

```bash
~/google-cloud-sdk/bin/gcloud projects list
```

Then set your default project:

```bash
~/google-cloud-sdk/bin/gcloud config set project PROJECT_ID
```

Example:
```bash
~/google-cloud-sdk/bin/gcloud config set project yavar-studio
```

## 4. Install GKE Auth Plugin

Required for kubectl to authenticate with GKE clusters:

```bash
~/google-cloud-sdk/bin/gcloud components install gke-gcloud-auth-plugin --quiet
```

## 5. List Available GKE Clusters

```bash
~/google-cloud-sdk/bin/gcloud container clusters list
```

Example output:
```
NAME                  LOCATION     MASTER_VERSION      STATUS
yavar-studio-cluster  asia-south1  1.35.3-gke.1389000  RUNNING
```

## 6. Get Cluster Credentials

Fetch credentials for kubectl:

```bash
~/google-cloud-sdk/bin/gcloud container clusters get-credentials CLUSTER_NAME --region REGION
```

Example:
```bash
~/google-cloud-sdk/bin/gcloud container clusters get-credentials yavar-studio-cluster --region asia-south1
```

## 7. Set Up PATH (for kubectl access)

Add gcloud to your PATH for the current session:

```bash
source ~/google-cloud-sdk/path.bash.inc
export PATH=$PATH:~/google-cloud-sdk/bin
```

To persist across sessions, add to `~/.bashrc`:

```bash
echo 'source ~/google-cloud-sdk/path.bash.inc' >> ~/.bashrc
```

## 8. Verify Connection

```bash
kubectl get ns
```

You should see a list of namespaces, confirming successful connection.

## 9. Create a Namespace (Optional)

```bash
kubectl create namespace z-agent
```

Set it as your default namespace:

```bash
kubectl config set-context --current --namespace=z-agent
```

## 10. Switching Accounts

### List Authenticated Accounts

```bash
gcloud auth list
```

Example output:
```
           CREDENTIALED ACCOUNTS
*  account1@gmail.com  (active)
   account2@gmail.com
```

### Add Another Account

```bash
gcloud auth login
```

This will add a new account and you can switch between them.

### Switch Active Account

```bash
gcloud config set account ACCOUNT_EMAIL
```

Example:
```bash
gcloud config set account account2@gmail.com
```

### Remove an Account

```bash
gcloud auth revoke ACCOUNT_EMAIL
```

### Re-authenticate Current Account

If your token expires:

```bash
gcloud auth login --account=ACCOUNT_EMAIL
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `gcloud auth list` | Show authenticated accounts |
| `gcloud config list` | Show current configuration |
| `kubectl config get-contexts` | List kubeconfig contexts |
| `kubectl config use-context CONTEXT` | Switch contexts |
| `gcloud container clusters get-credentials --help` | Help with credential options |

## Troubleshooting

**Error: "gcloud: executable file not found in $PATH"**
- Source the path file: `source ~/google-cloud-sdk/path.bash.inc`
- Or add to `.bashrc` permanently

**Error: "Couldn't get current server API group list"**
- Ensure gcloud auth plugin is installed
- Verify you have the correct permissions for the cluster
