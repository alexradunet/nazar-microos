export function renderLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/static/style.css">
  <script src="/static/htmx.min.js"></script>
  <script>htmx.config.allowEval = false;</script>
</head>
<body>
  <nav><h1>Nazar</h1></nav>
  <main>${body}</main>
</body>
</html>`;
}
