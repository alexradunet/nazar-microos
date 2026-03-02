IMAGE_NAME := localhost/nazar-os
IMAGE_TAG  := latest

.PHONY: image qcow2 containers clean

image:
	podman build -t $(IMAGE_NAME):$(IMAGE_TAG) -f Containerfile .

qcow2: image
	@test -f bootc/config.toml || { echo "ERROR: Copy bootc/config.toml.example to bootc/config.toml"; exit 1; }
	@mkdir -p _output
	sudo podman run --rm -it --privileged --pull=newer \
	  --security-opt label=type:unconfined_t \
	  -v ./bootc/config.toml:/config.toml:ro \
	  -v ./_output:/output \
	  -v /var/lib/containers/storage:/var/lib/containers/storage \
	  quay.io/centos-bootc/bootc-image-builder:latest \
	  --type qcow2 --rootfs xfs --config /config.toml $(IMAGE_NAME):$(IMAGE_TAG)

containers:
	podman build -t nazar-base -f containers/base/Containerfile .
	podman build -t ghcr.io/alexradunet/nazar-heartbeat:latest -f containers/heartbeat/Containerfile .
	podman build -t ghcr.io/alexradunet/nazar-matrix-bridge:latest -f containers/matrix-bridge/Containerfile .

clean:
	rm -rf _output/
