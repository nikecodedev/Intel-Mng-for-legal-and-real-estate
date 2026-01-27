#!/bin/bash

# ============================================
# Network Segregation Validation Script
# Validates Docker and Kubernetes network isolation
# ============================================

set -e

echo "============================================"
echo "Network Segregation Validation"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker is available"
    echo ""
    
    echo "--- Docker Network Inspection ---"
    docker network ls | grep platform-network || echo -e "${YELLOW}⚠${NC} platform-network not found"
    echo ""
    
    if docker network inspect platform-network &> /dev/null; then
        echo "Network Details:"
        docker network inspect platform-network --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' | head -1
        echo ""
        
        echo "Connected Containers:"
        docker network inspect platform-network --format '{{range .Containers}}{{.Name}} {{end}}' | tr ' ' '\n' | grep -v '^$'
        echo ""
        
        # Test connectivity
        echo "--- Testing Inter-Container Connectivity ---"
        if docker ps --format '{{.Names}}' | grep -q platform-api; then
            echo "Testing API -> PostgreSQL connectivity..."
            if docker exec platform-api ping -c 1 postgres &> /dev/null; then
                echo -e "${GREEN}✓${NC} API can reach PostgreSQL"
            else
                echo -e "${RED}✗${NC} API cannot reach PostgreSQL"
            fi
            
            echo "Testing API -> Redis connectivity..."
            if docker exec platform-api ping -c 1 redis &> /dev/null; then
                echo -e "${GREEN}✓${NC} API can reach Redis"
            else
                echo -e "${RED}✗${NC} API cannot reach Redis"
            fi
        else
            echo -e "${YELLOW}⚠${NC} platform-api container not running"
        fi
        echo ""
        
        echo "--- Container Port Exposure ---"
        echo "Exposed Ports:"
        docker ps --format "table {{.Names}}\t{{.Ports}}" | grep platform
        echo ""
    else
        echo -e "${YELLOW}⚠${NC} platform-network not found. Start services with docker-compose first."
        echo ""
    fi
else
    echo -e "${YELLOW}⚠${NC} Docker is not available"
    echo ""
fi

# Check if Kubernetes is available
if command -v kubectl &> /dev/null; then
    echo -e "${GREEN}✓${NC} kubectl is available"
    echo ""
    
    echo "--- Kubernetes Service Inspection ---"
    if kubectl get namespace platform &> /dev/null; then
        echo "Services in platform namespace:"
        kubectl get svc -n platform -o wide
        echo ""
        
        echo "Service Types:"
        kubectl get svc -n platform -o custom-columns=NAME:.metadata.name,TYPE:.spec.type
        echo ""
        
        echo "--- Network Policies ---"
        if kubectl get networkpolicies -n platform &> /dev/null; then
            kubectl get networkpolicies -n platform
        else
            echo -e "${YELLOW}⚠${NC} No network policies found (consider implementing for additional security)"
        fi
        echo ""
        
        echo "--- Pod Network Details ---"
        kubectl get pods -n platform -o custom-columns=NAME:.metadata.name,IP:.status.podIP,STATUS:.status.phase
        echo ""
        
        echo "--- Ingress Configuration ---"
        if kubectl get ingress -n platform &> /dev/null; then
            kubectl get ingress -n platform
        else
            echo -e "${YELLOW}⚠${NC} No ingress found"
        fi
        echo ""
    else
        echo -e "${YELLOW}⚠${NC} platform namespace not found"
        echo ""
    fi
else
    echo -e "${YELLOW}⚠${NC} kubectl is not available"
    echo ""
fi

echo "============================================"
echo "Validation Complete"
echo "============================================"




