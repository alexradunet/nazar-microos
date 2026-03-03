IMAGE_NAME := localhost/nazar-os
IMAGE_TAG  := latest

REGISTRY_PORT := 5000
REGISTRY_IMAGE := localhost:$(REGISTRY_PORT)/nazar-os:$(IMAGE_TAG)

.PHONY: image qcow2 chunked-oci containers registry push clean

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
	podman build -t nazar-base -f containers/base/Containerfile .
	podman build -t localhost/nazar-heartbeat:latest -f containers/heartbeat/Containerfile .
	podman build -t localhost/nazar-signal-cli:latest -f containers/signal-cli/Containerfile .
	podman build -t localhost/nazar-signal-bridge:latest -f containers/signal-bridge/Containerfile .
	podman build -t localhost/nazar-web-bridge:latest -f containers/web-bridge/Containerfile .
	podman build -t localhost/nazar-whatsapp-bridge:latest -f containers/whatsapp-bridge/Containerfile .

chunked-oci:
	podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f os/Containerfile .
	@mkdir -p _output
	rpm-ostree compose image \
	  --format=ociarchive \
	  $(IMAGE_NAME):$(IMAGE_TAG) \
	  _output/nazar-os-chunked.ociarchive

registry:
	@if podman container exists nazar-registry 2>/dev/null; then \
	  if [ "$$(podman inspect --format '{{.State.Running}}' nazar-registry)" = "true" ]; then \
	    echo "Registry already running on port $(REGISTRY_PORT)"; \
	  else \
	    podman start nazar-registry; \
	  fi; \
	else \
	  podman run -d --name nazar-registry -p $(REGISTRY_PORT):5000 \
	    --restart=always -v nazar-registry-data:/var/lib/registry \
	    docker.io/library/registry:2; \
	fi

push: image registry
	podman tag $(IMAGE_NAME):$(IMAGE_TAG) $(REGISTRY_IMAGE)
	podman push --tls-verify=false $(REGISTRY_IMAGE)

clean:
	rm -rf _output/
