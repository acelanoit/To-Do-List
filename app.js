const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
require("dotenv").config();
const atlasUri = process.env.ATLAS_URI;
const _ = require("lodash");

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static("public"));

// Create and connect to a new database inside MongoDB:
mongoose.connect(atlasUri);

// Create new Mongoose schema:
const itemsSchema = new mongoose.Schema({
  name: String
});

// Create new Mongoose model:
const Item = mongoose.model("Item", itemsSchema);

// Create 3 default items in the to-do list:
const item1 = new Item({
  name: "Welcome to your to-do list!"
});

const item2 = new Item({
  name: "Hit the + button to add a new item."
});

const item3 = new Item({
  name: "<-- Hit this to delete an item."
});

const defaultItems = [item1, item2, item3];

// Create a Mongoose schema for custom lists.
// Every new list that we create is going to have a name and an array of item documents associated with it:
const listSchema = {
  name: String,
  items: [itemsSchema]
};

// Create a Mongoose model for custom lists:
const List = mongoose.model("List", listSchema);

app.get("/", function (req, res) {

  // We use the .find() method with our Mongoose model (Item) to query the array of documents in the items collection:
  Item.find(function (err, foundItems) {
    if (err) {
      console.log(err);
    } else if (foundItems.length === 0) {

      // Save the items array into the todolistDB database if no error and if the foundItems array is empty because they haven't been saved yet:
      Item.insertMany(defaultItems, function (err) {
        if (err) {
          console.log(err);
        } else {
          console.log("Successfully saved all the items to todolistDB");
        }
        // We redirect the user to the home route after the default items were added to the database, so they will be rendered this time.
        // It is better to do so inside the callback (which gets executed after the insert operation is finished)
        // to prevent the redirect to occur before the items were added.
        res.redirect("/");
      });
    } else {
      // If the foundItems array is not empty because the default items (as well as any items that was added after)have already been saved,
      // render them:
      res.render("list", {
        listTitle: "Today",
        newListItems: foundItems
      });
    }
  });
});

// Create new document called item when the user adds an item into the to-do list:
app.post("/", function (req, res) {

  const itemName = req.body.newItem;
  const listName = req.body.list;

  const item = new Item({
    name: itemName
  });

  // Check if the list name that triggered the post request from list.ejs is equal to Today (and thus we are in the default list),
  // in which case:
  if (listName === "Today") {

    // Save the new document into the items collection.
    // Instead of simply typing "item.save();", it's better to use a callback (which will be executed after the .save() method)
    // inside which we can call res.redirect(), to prevent the page from reloading before the new item has been saved
    // (which could happen if res.redirect() is called outside of the callback, and this would cause the new item not to be displayed
    // until after reloading the page again):
    item.save(function (err) {
      if (err) {
        console.log(err);
      } else {
        // Reload the page to show the update:
        res.redirect("/");
      }
    });

    // If that's not the case, (and thus the newItem comes from a custom list),
    // then we need to search for that list document in our lists collection in our db and we need to add the item and
    // embed it into the existing array of items:
  } else {

    List.findOne({
      name: listName
    }, function (err, foundList) {
      foundList.items.push(item);

      // Then we need to save our foundList to update it with the new data:
      // Instead of simply typing "foundList.save();", it's better to use a callback (which will be executed after the .save() method)
      // inside which we can call res.redirect(), to prevent the page from reloading before the new item has been saved
      // (which could happen if res.redirect() is called outside of the callback, and this would cause the new item not to be displayed
      // until after reloading the page again):
      foundList.save(function (err) {
        if (err) {
          console.log(err);
        } else {
          // And finally we redirect the user to the route where the user came from:
          res.redirect("/" + listName);
        }
      });
    });
  }
});

// When a post request is made to the /delete route, we need to know the id of the item that the user checked/wants to delete,
// as well as the name of the list the post request was made from:
app.post("/delete", function (req, res) {
  const checkedItemId = req.body.checkbox;
  const listName = req.body.listName;

  // We use an if statement to determine if the item the user is making a post request to delete an item
  // from the default list (named Today) or from a custom list:
  if (listName === "Today") {
    // We use the .findByIdAndDelete() method with our Mongoose model (Item) to delete the document in the items collection with the id
    // of the document for which the checkbox was ticked:
    Item.findByIdAndDelete(checkedItemId, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Succesfully deleted checked item.");
      }
      // Reload the page to show the update.
      // It is better to do so inside the callback (which gets executed after the findByIdAndDelete operation is finished)
      // to prevent the redirect to occur before the item was deleted.
      res.redirect("/");
    });
  } else {

    // In order to delete the checked item from the items array, we combine the findOneAndUpdate() function in Mongoose
    // with the $pull operator in MongoDB:
    // We find the list the user is making the post request from by using the the findOneAndUpdate() function in Mongoose,
    // and for the 2nd parameter (what we want to update) we use the pull operator in MongoDB to pull the item with the id
    // of the document for which the checkbox was ticked:
    List.findOneAndUpdate({
      name: listName
    }, {
      $pull: {
        items: {
          _id: checkedItemId
        }
      }
    }, function (err, foundList) {
      if (err) {
        console.log(err);
      } else {

        // Finally, we redirect the user to the page from where the post request was made:
        res.redirect("/" + listName);
      }
    });
  }
});

// We use Express Route Parameters to create custom lists:
app.get("/:customListName", function (req, res) {

  // We use the .capitalize() method of Lodash to capitalize the first letter of the new list:
  const customListName = _.capitalize(req.params.customListName);

  // We use the .findOne() method with our Mongoose model (List) to check if a list with the name equal to the requested URL already exists:
  List.findOne({
    name: customListName
  }, function (err, foundList) {
    if (err) {
      console.log(err);
    } else if (foundList) {

      // Show an existing list:
      res.render("list", {
        listTitle: foundList.name,
        newListItems: foundList.items
      });
    } else {

      // Create a new list:
      const list = new List({
        name: customListName,
        items: defaultItems
      });

      // Save the new list into the lists collection.
      // Instead of simply typing "list.save();", it's better to use a callback (which will be executed after the .save() method)
      // inside which we can call res.redirect(), to prevent the page from reloading before the new list has been saved
      // (which could happen if res.redirect() is called outside of the callback, and this would cause the list to be saved twice):
      list.save(function (err) {
        if (err) {
          console.log(err);
        } else {
          // Reload the page to show the new list:
          res.redirect("/" + customListName);
        }
      });
    }
  });
});

app.listen(process.env.PORT || 3000, function () {
  console.log("Server is running.");
});
