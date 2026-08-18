#!/bin/bash
set -e

# Configuration
IMAGE_TAG="asia-south1-docker.pkg.dev/yavar-studio/yavar-platform/qualimetrix:latest-v1"
NAMESPACE="z-qualimetrix"

echo "🚀 Starting QualiMetrix deployment to GKE cluster..."

# Configure Docker for GAR authentication
echo "🔐 Configuring Google Artifact Registry authentication..."
gcloud auth configure-docker asia-south1-docker.pkg.dev --quiet

# Build Docker image
echo "📦 Building Docker image..."
docker build -t ${IMAGE_TAG} .

# Tag and push to registry
echo "📤 Pushing image to registry..."
docker push ${IMAGE_TAG}

# Update deployment with new image
echo "🔄 Updating Kubernetes deployment..."
sed "s|IMAGE_PLACEHOLDER|${IMAGE_TAG}|g" k8s/deployment.yaml | kubectl apply -f -

# Apply all Kubernetes manifests
echo "📋 Applying Kubernetes manifests..."
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Deploy databases first
echo "🗄️  Deploying PostgreSQL and Redis..."
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml

# Wait for databases to be ready
echo "⏳ Waiting for databases to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n ${NAMESPACE} --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n ${NAMESPACE} --timeout=180s

# Deploy application
echo "🚀 Deploying QualiMetrix application..."
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Wait for deployment to be ready
echo "⏳ Waiting for deployment to be ready..."
kubectl rollout status deployment/qualimetrix -n ${NAMESPACE} --timeout=5m

# Run database migrations
echo "🗃️  Running database migrations..."
kubectl exec -n ${NAMESPACE} deployment/qualimetrix -- npx prisma migrate deploy

# Get service information
echo "✅ Deployment completed!"
echo "📊 Service status:"
kubectl get all -n ${NAMESPACE}

echo "🌐 To access the application, check your Envoy Gateway configuration"
echo "🔧 To check logs: kubectl logs -f deployment/qualimetrix -n ${NAMESPACE}"