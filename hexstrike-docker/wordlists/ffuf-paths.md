# 常用字典路径速查

容器默认安装系统字典，并额外复制本仓库自带小字典。

## 自带快速字典

```text
/workspace/wordlists/hexstrike-custom/custom/high-value-web.txt
/workspace/wordlists/hexstrike-custom/custom/high-value-params.txt
/workspace/wordlists/hexstrike-custom/custom/api-sensitive.txt
/workspace/wordlists/hexstrike-custom/custom/backup-ext.txt
```

如果你在仓库目录使用：

```text
wordlists/custom/high-value-web.txt
wordlists/custom/high-value-params.txt
wordlists/custom/api-sensitive.txt
wordlists/custom/backup-ext.txt
```

## SecLists 常用 Web 路径

```text
/usr/share/seclists/Discovery/Web-Content/common.txt
/usr/share/seclists/Discovery/Web-Content/directory-list-2.3-small.txt
/usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt
/usr/share/seclists/Discovery/Web-Content/raft-large-files.txt
/usr/share/seclists/Discovery/Web-Content/quickhits.txt
```

## 参数名

```text
/usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt
/usr/share/seclists/Discovery/Web-Content/raft-small-words.txt
/usr/share/seclists/Discovery/Web-Content/raft-medium-words.txt
/workspace/wordlists/hexstrike-custom/custom/high-value-params.txt
```

## API / Swagger / GraphQL / Actuator

```text
/workspace/wordlists/hexstrike-custom/custom/api-sensitive.txt
/usr/share/seclists/Discovery/Web-Content/swagger.txt
/usr/share/seclists/Discovery/Web-Content/graphql.txt
/usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt
```

如果某个系统字典不存在，用这个找：

```bash
find /usr/share/seclists -iname '*api*' -o -iname '*swagger*' -o -iname '*graphql*' -o -iname '*parameter*'
```

## 子域名 / VHost

```text
/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
/usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt
/usr/share/seclists/Discovery/DNS/dns-Jhaddix.txt
/usr/share/seclists/Discovery/DNS/bitquark-subdomains-top100000.txt
```

## 备份文件扩展

```text
/workspace/wordlists/hexstrike-custom/custom/backup-ext.txt
```

常用扩展：

```text
bak,backup,old,orig,save,swp,tmp,temp,zip,rar,7z,tar,gz,tgz,sql,db,sqlite,log,conf,config,ini,yml,yaml,env,json,xml,pem,key,crt,jks,p12,pfx
```

## 快速 ffuf 示例

目录：

```bash
ffuf -u https://example.com/FUZZ -w /workspace/wordlists/hexstrike-custom/custom/high-value-web.txt
```

API：

```bash
ffuf -u https://example.com/FUZZ -w /workspace/wordlists/hexstrike-custom/custom/api-sensitive.txt
```

参数：

```bash
ffuf -u 'https://example.com/api/test?FUZZ=1' -w /workspace/wordlists/hexstrike-custom/custom/high-value-params.txt
```

备份扩展：

```bash
ffuf -u https://example.com/index.FUZZ -w /workspace/wordlists/hexstrike-custom/custom/backup-ext.txt
```
