'use strict';
import { plotAll } from "./buildallPlots.js";
// Wrap everything in an anonymous function to avoid polluting the global namespace
(function () {
  // Use the jQuery document ready signal to know when everything has been initialized
  $(document).ready(function () {
    // Tell Tableau we'd like to initialize our extension
    tableau.extensions.initializeAsync().then(function () {
      // The first step in choosing a sheet will be asking Tableau what sheets are available
      const dashboardObjects = tableau.extensions.dashboardContent.dashboard.objects;
      const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;
      var dashboardObjectVisibilityMap = new Map();
      dashboardObjects.forEach(object =>  {
        if (object.worksheet) {
          dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Hide);
        }
      });
      var dashboard = tableau.extensions.dashboardContent.dashboard;
      dashboard.setDashboardObjectVisibilityAsync(dashboardObjectVisibilityMap).then(() => {
        console.log("done");
      });
      const windowSize = dashboardObjects.find(p=> p.name === "Violin Chart").size; 
      loadSelectedMarks(worksheets, windowSize);
    });
  });

  function countUnique(iterable) {
    return new Set(iterable).size;
  }

  // This variable will save off the function we can call to unregister listening to marks-selected events
  let unregisterHandlerFunctions = [];

  async function loadSelectedMarks (worksheets, windowSize) {
    // Remove any existing event listeners
    if (unregisterHandlerFunctions.length > 0) {
      unregisterHandlerFunctions.forEach(f => f());
      unregisterHandlerFunctions = [];
    }

    const dataMap = new Map();
    // Call to get the selected marks for our sheet
    let nplots = 1;
    for (let i=0; i < worksheets.length; i++)  {
      if (i >= nplots) {
        break;
      }
      let dataTableReader = await worksheets[i].getSummaryDataReaderAsync();
      let worksheetData = await dataTableReader.getAllPagesAsync();
      if (i==0) {
        nplots = worksheetData.data[0][worksheetData.columns.findIndex(col => col.fieldName === "TS Violin Plots (Number of Plots)")].value;
      }
      // ... process data table ...
      const re = /.*\(Y-Axis\)$/;
      let key;
      const columns = worksheetData.columns.map((column, i) => {
                    let row = {};
                    row["type"] = column.dataType;
                    row["colindex"] = i;
                    if (column.fieldName.match(re)) {
                      row["name"] = "Y";
                      key = column.fieldName;
                      row["uniquecount"] = -1;
                      row["groupby"] = false;
                    } else if (column.fieldName.toLowerCase().includes("year")) {
                      row["name"] = "year";
                      row["uniquecount"] = 1;
                      row["groupby"] = true;
                    } else if (column.fieldName.toLowerCase().includes("quarter")) {
                      row["name"] = "quarter";
                      row["uniquecount"] = 2;
                      row["groupby"] = true;
                    } else {
                      row["name"] = column.fieldName;
                      row["uniquecount"] = 3;
                      row["groupby"] = false;
                    }
                    return row;
                  }).sort((a,b) => a.uniquecount - b.uniquecount);

      const data = worksheetData.data.map(row => {
                      let rowData = {};
                      for (var i = 0; i < columns.length; i++) {
                        if (columns[i].type === 'float') {
                          rowData[columns[i].name] =  row[columns[i].colindex].value;
                        } else {
                          rowData[columns[i].name] = row[columns[i].colindex].formattedValue;
                        }
                        }
                      return rowData;
                    });
      if (key) {
        dataMap.set(key, {columns: columns, data: data});
      }
      dataTableReader.releaseAsync().then();
    }
  
    // plot the chart
    plotAll(dataMap, windowSize);
    // Add an event listener for the selection changed event on this sheet.
    function reload(event) {
      // When the selection changes, reload the data
      const extension = tableau.extensions.dashboardContent.dashboard.objects.find(p=> p.name === "Violin Chart");
      const windowSize = extension.size;
      loadSelectedMarks(worksheetName, windowSize);
    }
    function visibility(event) {
      tableau.extensions.dashboardContent.dashboard.findParameterAsync("Violin Charts (Show/Hide)").then(par => {
        // When the parameter changes show/hide the extension
        const dashboardObjects = tableau.extensions.dashboardContent.dashboard.objects;
        const extension = dashboardObjects.find(p=> p.name === "Violin Chart");
        var dashboardObjectVisibilityMap = new Map();
        if (par.currentValue.value === "Show") {
          dashboardObjectVisibilityMap.set(extension.id, tableau.DashboardObjectVisibilityType.Show);
          dashboardObjects.forEach(object =>  {
            if (object.worksheet) {
              dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Hide);
            }
          });
        } else if (par.currentValue.value === "Hide") {
          dashboardObjectVisibilityMap.set(extension.id, tableau.DashboardObjectVisibilityType.Hide);
          dashboardObjects.forEach(object =>  {
            if (object.worksheet) {
              dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Show);
            }
          });
        }
        var dashboard = tableau.extensions.dashboardContent.dashboard;
        dashboard.setDashboardObjectVisibilityAsync(dashboardObjectVisibilityMap).then(() => {
          console.log("done");
        });
      })
    }
    tableau.extensions.dashboardContent.dashboard.findParameterAsync("Violin Charts (Show/Hide)").then(visibilitytoggle => {
      // Add an event listener for the selection changed event on this sheet.
      unregisterHandlerFunctions.push(visibilitytoggle.addEventListener(tableau.TableauEventType.ParameterChanged, visibility));
      // Fetch the saved sheet name from settings. This will be undefined if there isn't one configured yet
    });
    // unregisterHandlerFunctions.push(worksheet.addEventListener(tableau.TableauEventType.MarkSelectionChanged, reload));
    // unregisterHandlerFunctions.push(worksheet.addEventListener(tableau.TableauEventType.FilterChanged, reload));
  }
  
  
})();
