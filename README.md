# node-red-contrib-graphql-server

A set of nodes for <a href="http://nodered.org" target="_new">Node-RED</a> to run a local GraphQL Server.

## Install

To install the stable version use the Menu - Manage palette option and search for node-red-contrib-graphql-server ,
or Run the following command in your Node-RED user directory - typically `~/.node-red`

Note: Requries NodeJs version 11.15 or higher

    npm install node-red-contrib-graphql-server --engine-strict

## Usage

This node bundle helps you build a fully functional GraphQL Server for your application. It includes 3 nodes which together provide a full implementation
of GraphQL specifications:

- graphql-in : Creates a GraphQL server endpoint at the defined path supporting both query and mutation operations. The endpoint serves both <code>GET</code> and <code>POST</code> requests by default.</p>
- graphql-out: Sends responses back for requests recieved from a GraphQL In node.
- graphql-schema: Configuration to define a GraphQL schema.
- graphql-subscriptionserver : a graphql subscription server implementation using PubSub

## Summary of features

- Uses Node-RED httpNode which means it inherits any middlewares, security,etc. you may have.

- Includes [Dataloader](https://github.com/graphql/dataloader) which enables efficient query implementation for nested operations inherent to any GraphQL server.

- There are 3 modes to choose from to determine how you plan to resolve queries. Please read the docs to understand the differences.

- includes a [GraphQL Schema Visual editor](https://github.com/graphql-editor/graphql-editor), and [GraphQL Voyager](https://github.com/APIs-guru/graphql-voyager) builds ! (I may remove those builds from future nodes but those are great for learning GraphQL if you are new)

- includes a [GraphQL Playground](https://github.com/graphql/graphql-playground) (previously I used GraphiQL) - the Playground enables you to test your query, mutation operations and interact with the server. The Playground also supports subscriptions!

- Experimental feature to automatically resolve Pagination in your schema. This is supporting the unofficial [GraphQL Cursor Pagination Specs](https://relay.dev/graphql/connections.htm)

- Subscription Server implementation based on [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) using MQTT for PubSub which means you can use the out of box MQTT nodes with it.

- For testing and playing around, In the examples folder of the node, I included a sqlite database called chinook.sqlite [chinook-database](https://github.com/lerocha/chinook-database) and created a GraphQL schema for it. Import the sample flow if you want to try it. Note, this is relatively a complex sample which includes Pagination. If you are new to GraphQL , create your own simple GraphQL schema without pagination and familiarise yourself first.

## How to use it

1. Define a GraphQL schema using GraphQL schema language. (note syntax highlighting of GraphQL schema language is not working at the moment - if you are new to GraphQL use the included Visual [GraphQL-Editor](https://github.com/graphql-editor/graphql-editor) and it will generate a schema for you. Start by a simple schema.

2. Configure how you plan to resolve the queries and mutations, and Decide whether to use [Dataloader](https://github.com/graphql/dataloader)

3. Depending on what you choose for Resolvers mode, create flows which resolves your operations. Typically it starts with a Switch node which branches out to each type of operation you would resolve. The flow typically interacts with a backend database and returns the results back to clients.

4. Return the results to client using GraphQL Out node.
