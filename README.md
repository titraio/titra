[![Docker build](https://github.com/titraio/titra/actions/workflows/push.yml/badge.svg)](https://github.com/titraio/titra/actions/workflows/push.yml) ![Docker Pulls](https://badgen.net/docker/pulls/kromit/titra) ![Latest Release](https://img.shields.io/github/v/release/titraio/titra.svg)


# ![titra logo](public/favicons/favicon-32x32.png) titra
Modern open source project time tracking for freelancers and small teams

We believe in the philosophy ["Do One Thing And Do It Well."](https://en.wikipedia.org/wiki/Unix_philosophy#Do_One_Thing_and_Do_It_Well) and try to follow it in the design and implementation of titra. A great companion for titra is [Wekan](https://wekan.github.io/), where you can plan your tasks and track your time against later on.

## ⏱️ No risk, no fun, just time tracking
According to the philosophy described above, titra has been built to be the easiest, most convenient and modern way to track your time spent on projects. We want you to get started tracking your time as fast and with the least distractions as possible. After tracking your time, the second most important aspect is the ability to report and export your tracked time efficiently.

## 🚀 Blazing fast
Track your important project tasks in less than 10 seconds from login to done so you an focus on more important things.

![titra_track_time](https://github.com/titraio/titra/assets/11456790/c22d850e-d9de-4452-b9e0-a029d35acd89)

This is possible because we care a lot about performance and data sent over the wire, but you don't have to trust us on this one - just run a lighthouse audit to confirm the [performance score](https://github.com/titraio/titra/assets/11456790/84f26959-0000-40d4-a85c-4e968b1237f2) of 💯

## 👀 Try it!
We are providing a hosted version of titra free of charge at [app.titra.io](https://app.titra.io). Create an account in seconds and start tracking your time!

There is no better time to get started, titra just got a dark mode 🌑 and it is 🔥!

## 🐳 Running with Docker Compose
Here is a one-line example on how to get started with titra locally if you have [docker-compose](https://docs.docker.com/compose/) installed:
```
curl -L https://raw.githubusercontent.com/titraio/titra/refs/heads/master/docker-compose.yml | ROOT_URL=http://localhost:3000 docker-compose -f - up
```

This will pull in the latest titra release and spin up a local Mongodb instance in the latest version supported and link them together.
Congratulations! titra should now be up and running at http://localhost:3000

## 🚚 Deploy on DigitalOcean
titra is available in the [DigitalOcean Marketplace](https://marketplace.digitalocean.com/apps/titra?refcode=bc1d2516c8d2) for easy 1-click deployment of droplets. Get started below:

[![do-btn-blue](https://user-images.githubusercontent.com/11456790/74553033-c9399f80-4f56-11ea-9f9f-6f1ac4af50ce.png)](https://marketplace.digitalocean.com/apps/titra?refcode=bc1d2516c8d2&action=deploy)


## 📚 Documentation and more
Checkout our [wiki](https://wiki.titra.io) for best practices and to learn how to setup interfaces with external tools like Wekan.



Built with ❤️ in 🇦🇹
