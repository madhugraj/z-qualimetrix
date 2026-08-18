#!/bin/bash
set -e

# Configuration
GCP_PROJECT="yavar-studio"
GCP_REGION="asia-south1"
IMAGE_REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/qualimetrix"
IMAGE_NAME="qualimetrix"
IMAGE_TAG="${IMAGE_REGISTRY}/${IMAGE_NAME}:latest"

echo "🔧 Building QualiMetrix Docker image locally..."

# Build Docker image locally (without pushing)
docker build -t ${IMAGE_NAME}:local .

echo "✅ Local build completed!"
echo "🐳 To test locally: docker run -p 3001:3001 ${IMAGE_NAME}:local"
echo ""
echo "To push to GAR and deploy, run: ./k8s/deploy.sh"