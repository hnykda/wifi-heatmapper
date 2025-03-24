# Build the Docker Image
```shell
docker build -t wifi-heatmapper .
```

# Run the Container
```shell
docker run \
  --net="host" \
  --privileged \
  -p 3000:3000 \
  -v ./datas/data:/app/data \
  -v ./datas/media:/app/public/media \
  wifi-heatmapper
```

use `-v` options if you want to save db + floorplanpicture to the datas folder