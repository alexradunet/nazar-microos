IMAGE_NAME := localhost/nazar-os
IMAGE_TAG  := latest

.PHONY: image qcow2 containers clean

image:
	podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f Containerfile .

# qcow2 requires the image in root podman storage (bootc-image-builder mounts /var/lib/containers/storage)
qcow2:
	@test -f bootc/config.toml || { echo "ERROR: Copy bootc/config.toml.example to bootc/config.toml"; exit 1; }
	sudo podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f Containerfile .
	@mkdir -p _output
	sudo podman run --rm -i --privileged --pull=newer \
	  --security-opt label=type:unconfined_t \
	  -v ./bootc/config.toml:/config.toml:ro \
	  -v ./_output:/output \
	  -v /var/lib/containers/storage:/var/lib/containers/storage \
	  quay.io/centos-bootc/bootc-image-builder:latest \
	  --type qcow2 --rootfs xfs --config /config.toml $(IMAGE_NAME):$(IMAGE_TAG)

containers:
	podman build -t nazar-base -f containers/base/Containerfile .
	podman build -t localhost/nazar-heartbeat:latest -f containers/heartbeat/Containerfile .
	podman build -t localhost/nazar-signal-cli:latest -f containers/signal-cli/Containerfile .
	podman build -t localhost/nazar-signal-bridge:latest -f containers/signal-bridge/Containerfile .

clean:
	rm -rf _output/
