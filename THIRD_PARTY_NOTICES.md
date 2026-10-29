# 第三方代码、地图与素材说明

本文件汇总仓库中已有的第三方来源和许可文件，不为项目原创代码指定新的开源许可证。第三方资产保持各自原有的许可和使用条件；完整文字以链接及随附文件为准。

## Three.js

- 文件：`dist/vendor/three.module.js`、`dist/vendor/three.core.js`
- 作者署名：Copyright © 2010–2026 three.js authors
- 随附许可：MIT，完整文字位于 `dist/vendor/THREE-LICENSE.txt`
- 项目：[Three.js](https://threejs.org/) / [源码仓库](https://github.com/mrdoob/three.js)

两个 JavaScript 文件共同用于三维地球渲染，发布时保留模块及其许可文字。

## Natural Earth 陆地底图

- 文件：`dist/assets/land.geojson`
- 来源：Natural Earth
- 现有项目说明将该底图标为 public domain（公有领域）。
- 原始条款：[Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)

该底图用于简约地图及兼容渲染。

## NASA Blue Marble 地表影像

- 文件：`dist/assets/earth-blue-marble.jpg`
- 标题：Blue Marble Next Generation with Topography and Bathymetry, June 2004
- 署名：NASA Earth Observatory / Reto Stöckli
- 来源及处理元数据：`dist/assets/earth-blue-marble.source.json`
- [原始影像页面](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/)
- [NASA 图片与媒体使用指引](https://www.nasa.gov/nasa-brand-center/images-and-media/)

项目使用的是历史合成影像的缩放、JPEG 编码副本；不是实时卫星影像、真实三维高程或实时气候数据。保留来源署名和元数据。这里不把项目代码的许可套用于 NASA 素材，也不表示 NASA 为本项目背书。

## 时区边界数据

- 文件：`dist/assets/timezones-2026e.geojson`
- 来源：Timezone Boundary Builder 2026e，底层来源含 OpenStreetMap
- 署名：© OpenStreetMap contributors; timezone-boundary-builder contributors
- 已记录许可：Open Database License（ODbL）1.0
- 完整随附许可：`dist/assets/timezones-DATA-LICENSE.txt`
- 来源、简化处理和展示说明：`dist/assets/timezones-2026e.source.json`
- [上游项目](https://github.com/evansiroky/timezone-boundary-builder)
- [OpenStreetMap Copyright](https://www.openstreetmap.org/copyright)
- [ODbL 原文](https://opendatacommons.org/licenses/odbl/1-0/)

本地元数据记录了 419 个地域要素的几何简化及坐标精度处理，并说明派生数据继续按 ODbL 1.0 提供。发布派生数据时保留其来源、处理说明和完整许可。图层是社区维护的教学示意，不是精确法律或行政边界。实际钟点与 UTC 偏移由浏览器的 Intl / IANA 时区规则按所选日期计算，和该静态边界图层分别处理。

## 语音服务与教学资料

教学语音通过 MiniMax 生成。生成结果与服务使用遵循实际账户和提供方条款；本文件不为其另行声明开源许可。API 密钥、本机配置与动态私人音频不属于可公开的发布资产。

课程引用的 NIST、IANA、NOAA、政府及其他原始资料链接保留在相应数据模块和应用来源区域。资料来源链接本身不代表本站与这些机构存在合作或背书关系。
