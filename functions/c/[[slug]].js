// Sirve la carta para URLs /c/:slug en Cloudflare Pages
export async function onRequest(context) {
  const url = new URL(context.request.url)
  url.pathname = '/c/index.html'
  return context.env.ASSETS.fetch(url)
}
