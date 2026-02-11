import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

import { cloudflare } from "@cloudflare/vite-plugin"

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		vue(),
		vueDevTools(),
		cloudflare()
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url))
		},
	},
	server: {
		port: 5173,
	},
	build: {
		outDir: 'dist',
		assetsDir: 'assets',
		// 生产环境启用sourcemap便于调试，可根据需要关闭
		sourcemap: process.env.NODE_ENV === 'production' ? false : true,
		// 代码分割优化
		rollupOptions: {
			output: {
				// 手动分割代码块
				manualChunks: {
					// Vue核心库
					'vue-vendor': ['vue', 'vue-router', 'pinia'],
					// 其他第三方库可以根据需要添加
				},
				// 静态资源命名，包含hash用于缓存控制
				chunkFileNames: 'assets/js/[name]-[hash].js',
				entryFileNames: 'assets/js/[name]-[hash].js',
				assetFileNames: (assetInfo) => {
					// 根据文件类型分类存放
					const info = assetInfo.name?.split('.') || []
					const ext = info[info.length - 1]
					if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
						return `assets/images/[name]-[hash][extname]`
					} else if (/woff2?|eot|ttf|otf/i.test(ext)) {
						return `assets/fonts/[name]-[hash][extname]`
					} else if (/css/i.test(ext)) {
						return `assets/css/[name]-[hash][extname]`
					}
					return `assets/[name]-[hash][extname]`
				}
			}
		},
		// 压缩选项
		minify: 'esbuild',
		// 设置chunk大小警告限制
		chunkSizeWarningLimit: 1000,
		// 启用CSS代码分割
		cssCodeSplit: true,
		// 构建目标
		target: 'es2020',
		// 清空输出目录
		emptyOutDir: true
	},
	// 优化依赖预构建
	optimizeDeps: {
		include: ['vue', 'vue-router', 'pinia']
	}
})
