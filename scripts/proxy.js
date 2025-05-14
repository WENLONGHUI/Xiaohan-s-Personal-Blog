const { createProxyMiddleware } = require('http-proxy-middleware');

hexo.extend.filter.register('server_middleware', (app) => {
  app.use(
    '/vika-proxy',
    createProxyMiddleware({
      target: 'https://s1.vika.cn',
      changeOrigin: true, // 关键：修改 Host 头为目标域名
      pathRewrite: { '^/vika-proxy': '' },
      headers: {
        // 强制覆盖关键头，模拟浏览器直接访问
        Host: 's1.vika.cn',
        Origin: 'https://vika.cn',
        Referer: 'https://vika.cn/', // 可选：伪装为合法来源
      },
      onProxyReq: (proxyReq) => {
        // 移除可能暴露代理身份的头
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('x-real-ip');
      },
    })
  );
  return app;
}, 1);