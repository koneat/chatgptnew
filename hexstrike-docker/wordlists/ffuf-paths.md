# ffuf 常用字典路径速查

容器里默认安装 `wordlists` 和 `seclists`。常用路径如下。

## 目录扫描

```text
/usr/share/seclists/Discovery/Web-Content/common.txt
/usr/share/seclists/Discovery/Web-Content/directory-list-2.3-small.txt
/usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-directories-lowercase.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-directories-lowercase.txt
```

推荐顺序：

```text
common.txt -> raft-small-directories.txt -> raft-medium-directories.txt -> directory-list-2.3-medium.txt
```

## 文件扫描

```text
/usr/share/seclists/Discovery/Web-Content/raft-small-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-large-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-files-lowercase.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-files-lowercase.txt
```

## 扩展名扫描

常用扩展：

```text
php,asp,aspx,jsp,do,action,html,htm,js,json,txt,xml,yml,yaml,conf,config,bak,old,zip,tar.gz,7z,sql,log
```

## 参数名发现

```text
/usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-words.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-words.txt
/usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt
```

如果 `api/api-endpoints.txt` 不存在，用：

```bash
find /usr/share/seclists -iname '*api*' -o -iname '*parameter*'
```

## API / Swagger / 配置泄露

重点字典：

```text
/usr/share/seclists/Discovery/Web-Content/swagger.txt
/usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt
/usr/share/seclists/Discovery/Web-Content/graphql.txt
/usr/share/seclists/Discovery/Web-Content/quickhits.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-words.txt
```

重点路径手工补充：

```text
/api
/api/v1
/api/v2
/api-docs
/swagger
/swagger-ui
/swagger-ui.html
/swagger.json
/v2/api-docs
/v3/api-docs
/openapi.json
/graphql
/graphiql
/.env
/config.json
/app.config.js
/manifest.json
/asset-manifest.json
/sourcemap
/static/js/main.js.map
```

## JS / SourceMap

```text
/usr/share/seclists/Discovery/Web-Content/raft-small-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt
```

配合扩展：

```text
js,map,json,txt
```

重点看：

```text
*.js.map
main.*.js
app.*.js
chunk.*.js
runtime.*.js
vendor.*.js
```

## 备份文件 / 源码泄露

```text
/usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-words.txt
```

扩展：

```text
bak,backup,old,orig,save,swp,zip,tar,tar.gz,rar,7z,sql,db,sqlite,log,conf,config,ini,yml,yaml,env
```

## 子域名

```text
/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
/usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt
/usr/share/seclists/Discovery/DNS/dns-Jhaddix.txt
/usr/share/seclists/Discovery/DNS/bitquark-subdomains-top100000.txt
```

## 虚拟主机 / Host 头

```text
/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
/usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt
```

## 自带小字典

本目录还提供几个轻量字典，适合快速第一轮：

```text
wordlists/custom/high-value-web.txt
wordlists/custom/high-value-params.txt
wordlists/custom/backup-ext.txt
wordlists/custom/api-sensitive.txt
```
