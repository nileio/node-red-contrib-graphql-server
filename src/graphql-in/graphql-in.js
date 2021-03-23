// @ts-check
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
  const cors = require("cors");

  const { makeExecutableSchema } = require("graphql-tools");
  const { graphqlHTTP } = require("express-graphql"),
    expressPlayground = require("graphql-playground-middleware-express")
      .default;

  const DataLoader = require("dataloader");
  const { execute } = require("graphql");
  const { buildfieldResolvers } = require("./lib/resolvers");
  const { voyager } = require("./lib/voyager"),
    voyagerEnabled =
      RED.settings.graphqlIn && RED.settings.graphqlIn.voyager
        ? RED.settings.graphqlIn.voyager
        : false,
    paths = {};

  function GraphQLIn(n) {
    // #region ** Node-RED literals **

    RED.nodes.createNode(this, n);

    this.schemaConfig = RED.nodes.getNode(n.schema);
    this.path = n.path || "/graphql";
    this.method = n.method || "getandpost";
    this.timeout = n.timeout || 5000; // 5 seconds is default resolver functions timeout
    this.graphi = n.graphi;
    if (this.method === "postonly" || this.method === "getonly")
      this.graphi = false;
    this.resolverstype = n.resolverstype || "rootonly";
    this.resolvers = n.resolvers || [];
    this.usedataloader = n.usedataloader || false;
    this.useSubscriptionServer = n.useSubscriptionServer || false;
    this.subscriptionsPath = n.subscriptionsPath || "";
    this.pageInfo = {};
    const node = this,
      schema = node.schemaConfig.schema,
      resolvers = buildfieldResolvers(this, RED),
      logger = {
        log: (e) => {
          console.log(e);
          this.warn(e);
        },
      },
      execSchema = makeExecutableSchema({
        typeDefs: schema,
        resolvers: resolvers.fieldResolvers,
        logger,
        // for DEV purposes only - will return error if resolve functions return undefined. can be useful in debug.
        // consider expose to the editor
        allowUndefinedInResolve: false,
        resolverValidationOptions: {
          // this does nothing now other than asserts that all non-scalars have resolvers
          // when resolvertype=nonscalar is selected.
          // otherwise it will print a console warning. we assert that our internal function building resolvers properly work if no console warnings are printed on load
          // if the type selected is root+all nonscalars. can be taken out later on

          requireResolversForNonScalar: resolvers.requireResolversForNonScalar,
        },
      }),
      // #endregion

      // #region ** GraphQL server route implementation **
      server = RED.server,
      proto = RED.settings.requireHttps ? "https" : "http";

    node.serverURL = `${proto}://${server.address().address}:${
      server.address().port
    }${node.path}`;
    // node.subscriptionsEndpoint = ;
    if (server.listening && RED.settings.httpNodeRoot !== false) {
      try {
        if (!node.path) {
          this.error(RED._("graphql-in.errors.missing-path"));
          this.status({
            fill: "red",
            shape: "dot",
            text: "missing path",
          });
          return;
        }
        if (paths.hasOwnProperty(node.path)) {
          this.error(
            RED._("graphql-in.errors.duplicate-path", { path: node.path })
          );
          this.status({
            fill: "red",
            shape: "dot",
            text: `${node.path} already exists`,
          });
          return;
        }
        // default routing middleware
        let httpMiddleware = function (req, res, next) {
          next();
        };

        if (RED.settings.httpNodeMiddleware) {
          if (typeof RED.settings.httpNodeMiddleware === "function") {
            httpMiddleware = RED.settings.httpNodeMiddleware;
          }
        }
        let corsHandler = function (req, res, next) {
          next();
        };

        if (RED.settings.httpNodeCors) {
          corsHandler = cors(RED.settings.httpNodeCors);
          RED.httpNode.options("*", corsHandler);
        }
        const errorHandler = function (err, _req, res, _next) {
            node.warn(err);
            res.sendStatus(500);
          },
          extensions = ({
            document,
            variables,
            operationName,
            result,
            context,
          }) => ({
            runTime: Date.now() - context.startTime,
          }),
          getgraphQLOptions = (_req, usedataloader) => ({
            schema: execSchema,
            rootValue: null,
            graphiql: false,
            pretty: true,
            context: {
              startTime: Date.now(),
              dataloader: usedataloader
                ? new DataLoader(resolvers.batchFn, { cache: false })
                : undefined,
              loaderkeys: usedataloader ? {} : undefined,
              node: node,
            },
            customFormatErrorFn: (error) => ({
              message: error.message,
              locations: error.locations,
              stack: error.stack ? error.stack.split("\n") : [],
              path: error.path,
            }),
            extensions,
          }),
          // eslint-disable-next-line no-inner-declarations
          graphQLMiddleware = (usedataloader) => {
            return graphqlHTTP((request) =>
              getgraphQLOptions(request, usedataloader)
            );
          },
          // we need to use .get & .post rather than .use in order to be able to identity and remove the routes on re-deploy
          getMiddlewares = node.graphi
            ? [
                httpMiddleware,
                corsHandler,
                expressPlayground({
                  endpoint: node.path,
                  subscriptionEndpoint: node.useSubscriptionServer
                    ? `${proto === "https" ? "wss" : "ws"}://${
                        server.address().address
                      }:${server.address().port}${node.subscriptionsPath}`
                    : undefined,
                }),
                graphQLMiddleware(node.usedataloader),
                errorHandler,
              ]
            : [
                httpMiddleware,
                corsHandler,
                graphQLMiddleware(node.usedataloader),
                errorHandler,
              ];

        if (node.method === "getandpost" || node.method === "getonly") {
          RED.httpNode.get(node.path, getMiddlewares);
        }
        // RED.httpNode.use(graphQLMiddleware);
        if (node.method === "getandpost" || node.method === "postonly")
          RED.httpNode.post(
            node.path,
            httpMiddleware,
            corsHandler,
            graphQLMiddleware(node.usedataloader),
            errorHandler
          );

        const statusmsg =
          node.method === "getandpost"
            ? "GET/POST"
            : node.method === "getonly"
            ? "GET"
            : node.method === "postonly"
            ? "POST"
            : null;
        node.status({
          fill: "blue",
          shape: "dot",
          text: `${statusmsg}`,
        });
        paths[node.path] = node.path;
        console.log(`🚀  Graphql server running at ${node.serverURL}`);
      } catch (err) {
        node.status({
          fill: "red",
          shape: "dot",
          text: `${RED._("graphql-in.errors.internalerror", { error: err })}`,
        });
        // RED.notify here?
        console.log(`${err}`);
        this.error(`${err}`);
      }
    } else {
      this.error(RED._("graphql-in.errors.not-created"));
    }
    // #endregion

    this.on("close", function () {
      // Called when the node is shutdown - eg on redeploy.
      // Allows ports to be closed, connections dropped etc.
      // eg: node.client.disconnect();
      // const node = this;
      const routes = RED.httpNode._router.stack;

      RED.httpNode._router.stack = routes.filter(
        (route) => !(route.route && route.route.path === node.path)
      );
      delete paths[node.path];
      // you can achieve the same as above using
      // RED.httpNode._router.stack=.reduce((acc, cur) => {
      //   if (!(cur.route && cur.route.path === node.path)) {
      //     acc.push(cur);
      //     return acc;
      //   }
      // }, []);

      //  } RED.httpNode._router.stack.forEach(function (route, i, routes) {
      //     if (route.route && route.route.path === node.path) {
      //       routes.splice(i, 1);
      //     }
      //   });

      // routes.forEach(removeMiddlewares);
      // function removeMiddlewares(route, i, routes) {
      //   switch (route.handle.name) {
      //     case "graphqlMiddleware":
      //       routes.splice(i, 1);
      //   }
      //   if (route.route) route.route.stack.forEach(removeMiddlewares);
      // }
    });
  }
  RED.nodes.registerType("graphql-in", GraphQLIn, {
    settings: {
      graphqlInSettings: {
        value: {
          voyager: voyagerEnabled,
          uiPort: RED.settings.uiPort,
          uiHost: RED.settings.uiHost,
          https: RED.settings.requireHttps,
          httpAdminRoot: RED.settings.httpAdminRoot,
        },
        exportable: true,
      },
    },
  });

  if (voyagerEnabled) {
    // note: Not using RED.auth.needsPermission middleware because its mounted only on httpAdmin and if auth is enabled on httpNode it will return unauthorised.
    // TEST: this route should not be exposed on the host.
    RED.httpAdmin.get("/graphql-voyager", function (req, res, next) {
      const id = req.query.id;

      if (id) {
        const node = RED.nodes.getNode(id);

        if (node != null && node.type === "graphql-in") {
          const document = node.schemaConfig.getIntrosepctionAST(),
            schema = node.schemaConfig.getSchema(),
            promise = new Promise(function (resolve, reject) {
              resolve(execute(schema, document));
            });

          promise
            .then((result) => {
              const output = voyager(JSON.stringify(result));

              res.send(output);
            })
            .catch((err) => {
              node.error(`Voyager validation error: \n${err.message}`);
              console.log(err.message);
              res.status(500).send(err);
            });
        } else
          res.status(404).send("schema not found or flow is not yet deployed.");
      } else res.sendStatus(400);
    });
  }
  RED.httpAdmin.post(
    "/graphql-in/:id/getserverurl",
    RED.auth.needsPermission("graphql-in.read"),
    function (req, res) {
      const node = RED.nodes.getNode(req.params.id);

      if (node != null && node.type === "graphql-in") {
        try {
          res.status(200).send(node.serverURL);
        } catch (err) {
          res.sendStatus(500);
          //       //FIXME: node is null if there is an error !!
          //       //  node.error(RED._("graphql-in.errors.internalerror", { error: err.toString() }));
        }
      } else {
        res.status(200).send(false);
        //     //FIXME: node is null if there is an error !!
        //     // node.error(RED._("graphql-in.errors.missingnode", { id: req.params.id }));
      }
    }
  );
  // RED.httpAdmin.post("/graphql-in/:id/control/:action", RED.auth.needsPermission("graphql-in.write"), function (req, res) {
  //   const node = RED.nodes.getNode(req.params.id);
  //   const action = req.params.action;
  //   if (action && node != null && node.type === "graphql-in") {
  //     try {
  //       if (action === "start") {
  //         if (node.serverListening() === false) node.startServer();
  //       } else {
  //         if (node.serverListening() === true) node.stopServer();
  //       }
  //       res.status(200).send(node.serverListening());
  //     } catch (err) {
  //       res.sendStatus(500);
  //       // FIXME : node is undefined here
  //       node.error(RED._("graphql-in.errors.internalerror", { error: err.toString() }));
  //     }
  //   } else {
  //     res.status(404).send([]);
  //     node.error(RED._("graphql-in.errors.missingnode", { id: req.params.id }));
  //   }
  // });
};

// # sourceMappingURL=/src/graphql-in/graphql-in.js.map
