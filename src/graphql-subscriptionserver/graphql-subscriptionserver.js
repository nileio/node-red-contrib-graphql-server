/*
* Licensed under the MIT License (the "License");
* Copyright (c) 2019 Neil Lyon-S
* and other contributors, 
* https://github.com/nileio/node-red-contrib-graphql-nodes

* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:

* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.

* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
**/
module.exports = function (RED) {
  "use strict";
  // require any external libraries we may need....

  const { SubscriptionServer } = require("subscriptions-transport-ws");
  const { execute, subscribe } = require("graphql");
  const { MQTTPubSub } = require("graphql-mqtt-subscriptions");
  const { withFilter } = require("graphql-subscriptions");
  const { makeExecutableSchema } = require("graphql-tools");
  const ws = require("ws");
  const url = require("url");

  let subscriptionServers = {};
  let connections = 0;
  let serverUpgradeAdded = false;

  function GraphQLSubscriptionServer(n) {
    // Create a RED node
    RED.nodes.createNode(this, n);
    let pubsub = {};
    // Store local copies of the node configuration (as defined in the .html)

    this.name = n.name || "";
    this.subscriptionspath = n.subscriptionspath || "/subscriptions";
    this.module = n.module || "pubsubmqtt";
    this.mqttbroker = n.mqttbroker;
    this.mqttbrokerConn = RED.nodes.getNode(this.mqttbroker);
    this.schemaId = n.schema;
    this.schemaConfig = RED.nodes.getNode(this.schemaId);
    this.resolvers = {};
    this.execSchema = {};

    // register required functions

    // copy of 22-websocket.js ws listner code
    // credits goes to original author(s).
    this.handleServerUpgrade = function (request, socket, head) {
      const pathname = url.parse(request.url).pathname;
      if (subscriptionServers.hasOwnProperty(pathname)) {
        subscriptionServers[pathname].wsserver.handleUpgrade(
          request,
          socket,
          head,
          function done(ws) {
            subscriptionServers[pathname].wsserver.emit(
              "connection",
              ws,
              request
            );

          }
        );
      } else {
        // Don't destroy the socket as other listeners may want to handle the
        // event.
      }
    };

    this.asyncIteratorFn = function (_rootValue, _args, _context, info) {
      return pubsub.asyncIterator(`${info.fieldName}`);
    };

    this.filterFn = function (payload, variables, _context, info) {
      //return boolean or Promise<boolean> indicating if the payload should pass to the subscriber
      if (payload.hasOwnProperty(info.fieldName))
        payload = payload[info.fieldName];
      for (const key in variables) {
        if (payload.hasOwnProperty(key)) {
          if (!(payload[key] === variables[key])) return false;
        } else return false;
      }
      return true;
    };
    this.resolveFn = function (payload, variables, _context, info) {
      // Manipulate and return the new value
      if (payload.hasOwnProperty(info.fieldName))
        return payload[info.fieldName];
      else return payload;
    };
    this.subscribeFn = withFilter(this.asyncIteratorFn, this.filterFn);

    // manage state

    // copy local
    const node = this;
    if (this.mqttbrokerConn && this.schemaConfig) {
      let path = RED.settings.httpNodeRoot || "/";
      path =
        path +
        (path.slice(-1) == "/" ? "" : "/") +
        (node.subscriptionspath.charAt(0) == "/"
          ? node.subscriptionspath.substring(1)
          : node.subscriptionspath);
      node.fullPath = path;
      if (!subscriptionServers.hasOwnProperty(path)) {
        this.schema = this.schemaConfig.schema;


        //build subscription server resolvers
        const rootOperations = node.schemaConfig.getrootOperations();
        rootOperations.forEach((operation) => {
          const type = node.schemaConfig.getoperationType(operation);
          //subscription resolvers only
          if (type === "Subscription") {
            const subresolvers = Object.keys(
              node.schemaConfig.getoperationFields(operation)
            ).reduce(
              (r, c) =>
                Object.assign(r, {
                  [c]: {
                    resolve: this.resolveFn,
                    subscribe: this.subscribeFn,
                  },
                }),
              {}
            );
            Object.assign(node.resolvers, { [type]: subresolvers });
          }
        });
        //ensure the schema is valid containing subscription operations otherwise return
        if (!(node.resolvers.hasOwnProperty("Subscription"))) {
          this.error(
            RED._(
              "graphql-subscriptionserver.errors.no-subscription-operation",
              {
                schema: node.schemaConfig.name,
              }
            )
          );
          this.status({
            fill: "red",
            shape: "dot",
            text: `No Subscription operations found`,
          });
          return
        }
        // now register our node with mqtt broker and listen for connections
        node.mqttbrokerConn.register(this);
        node.mqttbrokerConn.client.on("connect", function () {
          const client = node.mqttbrokerConn.client;
          pubsub = new MQTTPubSub({
            client,
          });
          node.status({
            fill: "blue",
            shape: "dot",
            text: `0 connections`
          });
        })
        //Object.assign(node.resolvers,gqlnode.fieldresolvers.fieldResolvers)
        const logger = {
          log: (e) => {
            console.log(e);
            this.warn(e);
          },
        };

        node.execSchema = makeExecutableSchema({
          typeDefs: node.schema,
          resolvers: node.resolvers,
          logger,
        });

        if (!serverUpgradeAdded) {
          RED.server.on("upgrade", this.handleServerUpgrade);
          serverUpgradeAdded = true;
        }

        subscriptionServers[node.fullPath] = node;
        const serverOptions = {
          noServer: true,
        };
        // Create a WebSocket Server
        node.wsserver = new ws.Server(serverOptions);
        node.wsserver.setMaxListeners(0);

        //optional method to create custom params that will be used when resolving this operation. 
        //It can also be used to dynamically resolve the schema that will be used for the particular operation.
        const onOperation = function (message, params, webSocket) {

          node.send({ topic: "subscribe", payload: { event: "subscribe", data: message.payload } })
          return Promise.resolve(Object.assign({}, params, { context: params.context }))
        }
        //optional method that called when a GraphQL operation is done 
        //(for query and mutation it's immediately, and for subscriptions when unsubscribing)
        const onOperationComplete = function (webSocket, opId) {

          node.send({ topic: "unsubscribe", payload: { event: "unsubscribe", data: { id: opId } } })

        }
        // optional method that called when a client connects to the socket,
        const onConnect = function (_connectionParams, _webSocket, _context) {
          connections++;
          node.status({
            fill: connections === 0 ? "blue" : "green",
            shape: "dot",
            text: `${connections} connections`,
          });
          node.send({ topic: "clientConnected", payload: { event: "clientConnected", data: { totalConnections: connections } } })
        };
        //optional method that called when a client disconnects
        const onDisconnect = function (_webSocket, _context) {
          if (connections > 0) {
            connections--;
            node.status({
              fill: connections === 0 ? "blue" : "green",
              shape: "dot",
              text: `${connections} connections`,
            });
          }
          node.send({ topic: "clientDisconnected", payload: { event: "clientDisconnected", data: { totalConnections: connections } } })
        };
        //Create the subscription server
        node.subscriptionServer = SubscriptionServer.create(
          {
            schema: node.execSchema,
            execute,
            subscribe,
            onOperation,
            onOperationComplete,
            onConnect,
            onDisconnect
          },
          node.wsserver
        );
        console.log(`🦉  Graphql Subscription server listening on ${RED.settings.requireHttps ? 'wss' : 'ws'}://${RED.settings.uiHost}:${RED.settings.uiPort}${this.subscriptionspath}`)
      } else {
        this.error(
          RED._("graphql-subscriptionserver.errors.duplicate-path", {
            path: node.subscriptionspath,
          })
        );
        this.status({
          fill: "red",
          shape: "dot",
          text: `${node.subscriptionspath} already exists`,
        });
      }
    } else {
      this.error(RED._("graphql-subscriptionserver.errors.missing-config"));
    }
    node.on("close", function (removed, done) {
      delete subscriptionServers[node.fullPath];

      //attempt to gracefully terminate servers and clients
      //graceful termination in case of flow re-deploy depends on the CLIENT closing connections otherwise a console message may appear
      //with a connection reset message or so. For example, the client node https://github.com/adamgoose/node-red-contrib-gql-sub closes connection
      //properlly and therefore no error messages are generated.
      node.subscriptionServer.close()

      if (node.mqttbrokerConn.client && node.mqttbrokerConn.client.connected)
        node.mqttbrokerConn.client.end();

      pubsub.mqttConnection.end(true)
      node.mqttbrokerConn.deregister(node, function () {
        return done()

      })

    });
  }
  RED.nodes.registerType(
    "graphql-subscriptionserver",
    GraphQLSubscriptionServer
  );
};
