# Setup GCP Service Account for GitHub Actions

1. Create GCP Service Account:
```bash
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deploy" \
  --project=yavar-studio
```

2. Grant permissions:
```bash
gcloud projects add-iam-policy-binding yavar-studio \
  --member="serviceAccount:github-actions@yavar-studio.iam.gserviceaccount.com" \
  --role="roles/storage.admin" \
  --role="roles/cloudbuild.builds.builder" \
  --role="roles/container.developer"
```

3. Create and download key:
```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@yavar-studio.iam.gserviceaccount.com
```

4. Add to GitHub Secrets:
   - Go to: https://github.com/madhugraj/z-qualimetrix/settings/secrets
   - Add new secret: `GCP_SA_KEY`
   - Paste contents of `key.json`

Then trigger the workflow again.
