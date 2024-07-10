'use strict';
import {plotTimeSeriesViolins, plotOperatorViolins} from "./buildAllPlots.js";
// Wrap everything in an anonymous function to avoid polluting the global namespace
(function () {
  // Use the jQuery document ready signal to know when everything has been initialized
  $(document).ready(function () {
    // Tell Tableau we'd like to initialize our extension
    tableau.extensions.initializeAsync().then(function () {
        loadSelectedMarks();
    });
  });

  function countUnique(iterable) {
    return new Set(iterable).size;
  }

  // This variable will save off the function we can call to unregister listening to marks-selected events
  let unregisterHandlerFunctions = [];

  async function loadSelectedMarks () {
    // Remove any existing event listeners
    if (unregisterHandlerFunctions.length > 0) {
      unregisterHandlerFunctions.forEach(f => f());
      unregisterHandlerFunctions = [];
    }
    // Determine the plot type
    const dashboard = tableau.extensions.dashboardContent.dashboard;
    const plotType = await dashboard.findParameterAsync("TS/Distribution - Plot Types");
    const parChanged = tableau.TableauEventType.ParameterChanged;
    const dashboardObjects = dashboard.objects;
    const extension = dashboardObjects.find(p=> p.name === "Violin Chart");
    let windowSize = extension.size;
    let dashboardObjectVisibilityMap = new Map();
    let re = /.*Workbook Coloring.*|.*Mark Size.*|.*Top Wells.*/;
    if (!plotType.currentValue.value.includes("Violin")) {
        dashboardObjectVisibilityMap.set(extension.id, tableau.DashboardObjectVisibilityType.Hide);
        dashboardObjects.forEach(object =>  {
          if (object.worksheet || object.name.match(re)) {
            dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Show);
          }
        });
        unregisterHandlerFunctions.push(plotType.addEventListener(parChanged, event => loadSelectedMarks()));
        dashboard.setDashboardObjectVisibilityAsync(dashboardObjectVisibilityMap).then(() => {
          console.log("done");
        });
        return;
    } else {
        dashboardObjectVisibilityMap.set(extension.id, tableau.DashboardObjectVisibilityType.Show);
        let width = 0;
        let height = 0;
        dashboardObjects.forEach(object =>  {
          if (object.worksheet || object.name.match(re)) {
            dashboardObjectVisibilityMap.set(object.id, tableau.DashboardObjectVisibilityType.Hide);
            if (object.worksheet) {
              width += object.size.width;
              height += object.size.height;
            }
          }
        });
        if (windowSize.width < 100) {
          windowSize.width = width;
        }
        if (windowSize.height < 100) {
          windowSize.height = height;
        }
        unregisterHandlerFunctions.push(plotType.addEventListener(parChanged, event => loadSelectedMarks()));
        dashboard.setDashboardObjectVisibilityAsync(dashboardObjectVisibilityMap).then(() => {
          console.log("done");
        });
    } 
    // First determine the number of subplots
    const worksheets = dashboard.worksheets;
    let nplots=0;
    let transform = (x) => x;
    const modContainer = d3.select("#plot-container");
    //  Main svg container
    let svg = tableau.extensions.settings.get("svg");
    if (!svg) {
      svg = modContainer.append("svg");
      tableau.extensions.settings.set("svg", svg);
    }
    // Sets the viewBox to match windowSize
    svg.attr("viewBox", [0, 0, windowSize.width, windowSize.height]);
    svg.selectAll("*").remove();
    svg.append("text")
          .attr("text-anchor", "middle")
          .attr("x", 0.5 * windowSize.width)
          .attr("y", 0.5 * windowSize.height)
          .style("font-size", "3em")
          .text("Loading Data... Please Wait!");
          
    let date_level = 1;
    re = /.*=(\d).*/;
    if (plotType.currentValue.value.match(re)) {
      nplots = parseInt(plotType.currentValue.value.match(re)[1]);
    }
    re = /.*Proppant Mesh Size.*|.*Well Parameter.*|.*Proppant Type.*|.*Sand Type.*/;
    if (plotType.currentValue.value.match(re)) {
      transform = Math.log10;
    }
   
    // Next find the columns to extract
    let options = {
        maxRows: 1, // Max rows to return. Use 0 to return all rows.
        includeDataValuesOption: tableau.IncludeDataValuesOption.OnlyNativeValues
    }

    const cols_to_include = {};
    const keys = {}; // for storing the Y-axis labels
    
    if (!plotType.currentValue.value.includes("Distribution")) {
      const datelevel = await dashboard.findParameterAsync("Time Series Date Level");
      unregisterHandlerFunctions.push(datelevel.addEventListener(parChanged, event => loadSelectedMarks()));
      if (datelevel.currentValue.value === "quarter") {
        re = /.*\(y-axis\)$|.*year.*|.*quarter.*/;
        date_level = 2;
      } else if (datelevel.currentValue.value === "year") {
        re = /.*\(y-axis\)$|.*year.*/;
        date_level = 1;
      }
    } else {
      re = /.*\(y-axis\)$|.*quarter.*|.*sort.*/;
      date_level = 1;
    }
    for (let i=0; i < nplots; i++)  {
      let temp = [];
      const worksheet = worksheets[i].name;
      const dataTableReader = await worksheets[i].getSummaryDataReaderAsync(1, options);
      const worksheetData = await dataTableReader.getAllPagesAsync(1);
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
      const dataTableReader = await worksheets[i].getSummaryDataReaderAsync(10000, options);
      const worksheetData = await dataTableReader.getAllPagesAsync();
      // ... process data table ...
      const columns = worksheetData.columns.map((column, i) => {
                    let row = {};
                    row["type"] = column.dataType;
                    row["colindex"] = i;
                    if (column.fieldName.match(re)) {
                      row["name"] = "Y";
                      row["rank"] = -1;
                      row["groupby"] = false;
                    } else if (column.fieldName.toLowerCase().includes("year")) {
                      row["name"] = "year";
                      row["rank"] = 1;
                      row["groupby"] = true;
                    } else if (column.fieldName.toLowerCase().includes("quarter")) {
                      row["name"] = "quarter";
                      row["rank"] = 2;
                      row["groupby"] = true;
                    } else if (column.fieldName.toLowerCase().includes("operator")) {
                      row["name"] = "Operator";
                      row["rank"] = 2;
                      row["groupby"] = true;
                    } else if (column.fieldName.toLowerCase().includes("sort")) {
                      row["name"] = "Sort";
                      row["rank"] = 3;
                      row["groupby"] = true;
                    } else {
                      row["name"] = column.fieldName;
                      row["rank"] = 3;
                      row["groupby"] = false;
                    }
                    return row;
                  }).sort((a,b) => a.rank - b.rank);

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
    if (!plotType.currentValue.value.includes("Distribution")) {
      plotTimeSeriesViolins(svg, dataMap, date_level, windowSize, transform);
    } else {
      plotOperatorViolins(svg, dataMap, windowSize, transform);
    }
    // unregisterHandlerFunctions.push(dashboard.addEventListener(tableau.TableauEventType.DashboardLayoutChanged, reload));
    // unregisterHandlerFunctions.push(worksheet.addEventListener(tableau.TableauEventType.FilterChanged, reload));
  }
})();
