IMAGE_NAME := localhost/pibloom-os
IMAGE_TAG  := latest

REGISTRY_PORT := 5000
REGISTRY_IMAGE := localhost:$(REGISTRY_PORT)/pibloom-os:$(IMAGE_TAG)

.PHONY: image qcow2 iso chunked-oci containers registry push push-ghcr clean

image:
	podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f os/Containerfile .

# qcow2 requires the image in root podman storage (bootc-image-builder mounts /var/lib/containers/storage)
qcow2:
	@test -f os/bootc/config.toml || { echo "ERROR: Copy os/bootc/config.toml.example to os/bootc/config.toml"; exit 1; }
	sudo podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f os/Containerfile .
	@mkdir -p _output
	sudo podman run --rm -i --privileged --pull=newer \
	  --security-opt label=type:unconfined_t \
	  -v ./os/bootc/config.toml:/config.toml:ro \
	  -v ./_output:/output \
	  -v /var/lib/containers/storage:/var/lib/containers/storage \
	  quay.io/centos-bootc/bootc-image-builder:latest \
	  --type qcow2 --rootfs xfs --config /config.toml $(IMAGE_NAME):$(IMAGE_TAG)

containers:
	podman build -t pibloom-base -f core/containers/base/Containerfile .
	podman build -t localhost/pibloom-signal-cli:latest -f bridges/signal/containers/signal-cli/Containerfile .
	podman build -t localhost/pibloom-signal-bridge:latest -f bridges/signal/Containerfile .
	podman build -t localhost/pibloom-web-bridge:latest -f bridges/web/Containerfile .
	podman build -t localhost/pibloom-whatsapp-bridge:latest -f bridges/whatsapp/Containerfile .

iso:
	@test -f os/bootc/config.toml || { echo "ERROR: Copy os/bootc/config.toml.example to os/bootc/config.toml"; exit 1; }
	sudo podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f os/Containerfile .
	@mkdir -p _output
	sudo podman run --rm -i --privileged --pull=newer \
	  --security-opt label=type:unconfined_t \
	  -v ./os/bootc/config.toml:/config.toml:ro \
	  -v ./_output:/output \
	  -v /var/lib/containers/storage:/var/lib/containers/storage \
	  quay.io/centos-bootc/bootc-image-builder:latest \
	  --type iso --config /config.toml $(IMAGE_NAME):$(IMAGE_TAG)

chunked-oci:
	podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f os/Containerfile .
	@mkdir -p _output
	rpm-ostree compose image \
	  --format=ociarchive \
	  $(IMAGE_NAME):$(IMAGE_TAG) \
	  _output/pibloom-os-chunked.ociarchive

registry:
	@if podman container exists pibloom-registry 2>/dev/null; then \
	  if [ "$$(podman inspect --format '{{.State.Running}}' pibloom-registry)" = "true" ]; then \
	    echo "Registry already running on port $(REGISTRY_PORT)"; \
	  else \
	    podman start pibloom-registry; \
	  fi; \
	else \
	  podman run -d --name pibloom-registry -p $(REGISTRY_PORT):5000 \
	    --restart=always -v pibloom-registry-data:/var/lib/registry \
	    docker.io/library/registry:2; \
	fi

push: image registry
	podman tag $(IMAGE_NAME):$(IMAGE_TAG) $(REGISTRY_IMAGE)
	podman push --tls-verify=false $(REGISTRY_IMAGE)

push-ghcr:
	@test -n "$(GHCR_REPO)" || { echo "ERROR: Set GHCR_REPO (e.g., ghcr.io/youruser/pibloom-os)"; exit 1; }
	podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f os/Containerfile .
	podman tag $(IMAGE_NAME):$(IMAGE_TAG) $(GHCR_REPO):$(IMAGE_TAG)
	podman push $(GHCR_REPO):$(IMAGE_TAG)

clean:
	rm -rf _output/
