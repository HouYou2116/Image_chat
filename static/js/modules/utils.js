// ===========================
// 工具函数模块 (Utils Module)
// ===========================
// 职责: 纯工具函数，无副作用，不依赖全局状态

/**
 * 下载单张图片
 * @param {string} url - 图片下载地址
 * @param {string} filename - 保存文件名
 */
export function downloadSingleImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * 批量下载图片
 * @param {Array<string>} urls - 图片下载地址数组
 * @param {string} prefix - 文件名前缀，默认 'image'
 */
export function downloadAllImages(urls, prefix = 'image') {
    if (!urls || urls.length === 0) {
        console.warn('[Utils] downloadAllImages: 没有可下载的图片');
        return;
    }

    urls.forEach((url, index) => {
        setTimeout(() => {
            downloadSingleImage(url, `${prefix}_${index + 1}.png`);
        }, index * 200); // 延迟避免浏览器拦截
    });

    console.log(`[Utils] 开始下载 ${urls.length} 张图片`);
}
