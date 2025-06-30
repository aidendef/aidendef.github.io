---
title: "최근 글 목록 훔쳐보기"
layout: archive
permalink: /recent/
---

<h2>최근 글</h2>

<ul>
{% for post in site.posts limit:10 %}
  <li><a href="{{ post.url }}">{{ post.title }}</a> </li>
{% endfor %}
</ul>
