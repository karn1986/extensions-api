'use strict';
import {plotTimeSeriesViolins, plotOperatorViolins} from "./buildAllPlots.js";
// Wrap everything in an anonymous function to avoid polluting the global namespace
(function () {
  // Use the jQuery document ready signal to know when everything has been initialized
  $(document).ready(function () {
    // Tell Tableau we'd like to initialize our extension
    tableau.extensions.initializeAsync().then(function () {
      tableau.extensions.dashboardContent.dashboard.findParameterAsync("Violin Charts (Show/Hide)").then(par => {
        // The first step in choosing a sheet will be asking Tableau what sheets are available
        const dashboardObjects = tableau.extensions.dashboardContent.dashboard.objects;
        const extension = dashboardObjects.find(p=> p.name === "Violin Chart");
        const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;
        let windowSize = extension.size;
        let dashboardObjectVisibilityMap = new Map();
        if (par.currentValue.value === "Show") {
          dashboardObjectVisibilityMap.set(extension.id, tableau.DashboardObjectVisibilityType.Show);
          let width = 0;
          let height = 0;
          dashboardObjects.forEach(object =>  {
            if (object.worksheet) {
              dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Hide);
              width += object.size.width;
              height += object.size.height;
            }
          });
          if (windowSize.width < 100) {
            windowSize.width = width;
          }
          if (windowSize.height < 100) {
            windowSize.height = height;
          }
          console.log(`width is ${windowSize.width} and height is ${windowSize.height}`);
        } else if (par.currentValue.value === "Hide") {
          dashboardObjectVisibilityMap.set(extension.id, tableau.DashboardObjectVisibilityType.Hide);
          dashboardObjects.forEach(object =>  {
            if (object.worksheet) {
              dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Show);
            }
          });
        }
        const dashboard = tableau.extensions.dashboardContent.dashboard;
        dashboard.setDashboardObjectVisibilityAsync(dashboardObjectVisibilityMap).then(() => {
          console.log("done");
        });

        loadSelectedMarks(worksheets, windowSize).then();
      });
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

    // First determine the number of subplots
    let nplots;
    let transform = (x) => x;
    const dashboard = tableau.extensions.dashboardContent.dashboard
    const plotType = await dashboard.findParameterAsync("TS/Distribution - Plot Types");
    switch (plotType.currentValue.value) {
      case "Norm Completion Parameter":
      case "Perforation Parameter":
      case "Completion Parameter":
      case "Petrophysical":
      case "Production":
      case "Adjusted Water Cut":
      case "Pre-Production (All Formations)":
      case "Pre-Production (Formation Specific)":
        nplots = 5;
        break;
      case "Proppant Mesh Size":
        nplots = 4;
        transform = Math.log10;
        break;
      case "Well Parameter":
      case "Proppant Type":
        nplots = 3;
        transform = Math.log10;
        break;
      case "Sand Type":
        nplots = 2;
        transform = Math.log10;
        break;
      case "Fluid History":
          nplots = 8;
          break;
      case "GOR":
        nplots = 6;
        break;
      default:
        nplots = 0;
    }

    // if (nplots<1) {
    //   return;
    // }

    // Next find the columns to extract
    let options = {
        maxRows: 1, // Max rows to return. Use 0 to return all rows.
        includeDataValuesOption: tableau.IncludeDataValuesOption.OnlyNativeValues
    }

    const cols_to_include = {};
    const keys = {}; // for storing the Y-axis labels
    let re, date_level;
    if (dashboard.name === "Time Series") {
      const datelevel = await dashboard.findParameterAsync("Time Series Date Level");
      if (datelevel.currentValue.value === "quarter") {
        re = /.*\(y-axis\)$|.*year.*|.*quarter.*/;
        date_level = 2;
      } else if (datelevel.currentValue.value === "year") {
        re = /.*\(y-axis\)$|.*year.*/;
        date_level = 1;
      }
    } else {
      re = /.*\(y-axis\)$|operator$/;
      date_level = 1;
    }
    for (let i=0; i < nplots; i++)  {
      let temp = [];
      const worksheet = worksheets[i].name;
      let dataTableReader = await worksheets[i].getSummaryDataReaderAsync(1, options);
      let worksheetData = await dataTableReader.getAllPagesAsync(1);
      worksheetData.columns.forEach((column, index) => {
        if (column.fieldName.toLowerCase().match(re)) {
          temp.push(column.fieldId)
        }
        if (column.fieldName === `ATTR(TS Labels - Sheet ${i+1} (Y-Axis))`) {
          keys[worksheet] = worksheetData.data[0][index].value;
        }
      });
      cols_to_include[worksheet] = temp;
      await dataTableReader.releaseAsync();
    }
    
    // Now fetch all data only for the columsn determined above
    const dataMap = new Map();
    re = /.*\(Y-Axis\)$/;
    options.maxRows = 0;
    for (let i=0; i < nplots; i++)  {
      const worksheet = worksheets[i].name;
      options.columnsToIncludeById = cols_to_include[worksheet];
      let dataTableReader = await worksheets[i].getSummaryDataReaderAsync(10000, options);
      let worksheetData = await dataTableReader.getAllPagesAsync();
      // ... process data table ...
      const columns = worksheetData.columns.map((column, i) => {
                    let row = {};
                    row["type"] = column.dataType;
                    row["colindex"] = i;
                    if (column.fieldName.match(re)) {
                      row["name"] = "Y";
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
                    } else if (column.fieldName.toLowerCase().includes("operator")) {
                      row["name"] = "Operator";
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
                      columns.forEach(col => {
                        rowData[col.name] =  row[col.colindex].value;
                      });
                      return rowData;
                    });
      dataMap.set(keys[worksheet], {columns: columns, data: data});
      await dataTableReader.releaseAsync();
    }
  
    // plot the chart
    if (dashboard.name === "Time Series") {
      plotTimeSeriesViolins(dataMap, date_level, windowSize, transform);
    } else {
      plotOperatorViolins(dataMap, windowSize, transform);
    }
    // Add an event listener for the selection changed event on this sheet.
    function reload(event) {
      // When the selection changes, reload the data
      const extension = tableau.extensions.dashboardContent.dashboard.objects.find(p=> p.name === "Violin Chart");
      const windowSize = extension.size;
      loadSelectedMarks(worksheets, windowSize).then();
    }
    function visibility(event) {
      tableau.extensions.dashboardContent.dashboard.findParameterAsync("Violin Charts (Show/Hide)").then(par => {
        // When the parameter changes show/hide the extension
        const dashboardObjects = tableau.extensions.dashboardContent.dashboard.objects;
        const extension = dashboardObjects.find(p=> p.name === "Violin Chart");
        let dashboardObjectVisibilityMap = new Map();
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
        let dashboard = tableau.extensions.dashboardContent.dashboard;
        dashboard.setDashboardObjectVisibilityAsync(dashboardObjectVisibilityMap).then(() => {
          console.log("done");
        });
      })
    }
    dashboard.findParameterAsync("Violin Charts (Show/Hide)").then(par => {
      // Add an event listener for the selection changed event on this sheet.
      unregisterHandlerFunctions.push(par.addEventListener(tableau.TableauEventType.ParameterChanged, visibility));
    });
    dashboard.findParameterAsync("TS/Distribution - Plot Types").then(par => {
      // Add an event listener for the selection changed event on this sheet.
      unregisterHandlerFunctions.push(par.addEventListener(tableau.TableauEventType.ParameterChanged, reload));
    });
    if (dashboard.name === "Time Series") {
      dashboard.findParameterAsync("Time Series Date Level").then(par => {
        // Add an event listener for the selection changed event on this sheet.
        unregisterHandlerFunctions.push(par.addEventListener(tableau.TableauEventType.ParameterChanged, reload));
      });
    }
    // unregisterHandlerFunctions.push(dashboard.addEventListener(tableau.TableauEventType.DashboardLayoutChanged, reload));
    // unregisterHandlerFunctions.push(worksheet.addEventListener(tableau.TableauEventType.FilterChanged, reload));
  }
  
  
})();
