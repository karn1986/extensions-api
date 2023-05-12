export function plotTimeSeriesViolins(dataMap, date_level, windowSize, transform) {

    const modContainer = d3.select("#plot-container");
    //  Main svg container
    let svg = tableau.extensions.settings.get('TSsvg');
    if (!svg) {
      svg = modContainer.append("svg");
      tableau.extensions.settings.set('TSsvg', svg);
    }
  
    // The margins around the chart canvas.
    const margin = { top: 5, right: 1, bottom: 40, left: 80 };

    // The position and size of the chart canvas.
    const canvas = { 
        width: windowSize.width - (margin.left + margin.right),
        height: windowSize.height - (margin.top + margin.bottom)
    };
    if (canvas.height < 0 || canvas.width < 0) {
        // Abort rendering if the window is not large enough to render anything.
        svg.selectAll("*").remove();
        return;
    }
    
    const {data, yScales, nbins, plot_height} = groupby(dataMap, canvas, margin);
    const XLeaves = sortbyKeys(data, date_level);
    const xScale = get_xScale(XLeaves, windowSize, margin); 
    bin_and_count(XLeaves, yScales, nbins, transform);
    compute_histogram(XLeaves, xScale);

    const curve = d3.curveCatmullRom.alpha(0.5);
    // Sets the viewBox to match windowSize
    svg.attr("viewBox", [0, 0, windowSize.width, windowSize.height]);
    svg.selectAll("*").remove();
    //  Prepare groups that will hold all elements of an area chart
    svg.append("g").attr("class", "yaxis_labels");
    svg.append("g").attr("class", "xaxis_labels");
    svg.append("g").attr("class", "xaxes");
    svg.append("g").attr("class", "histogram");
    svg.append("g").attr("class", "means");
    // Generate X-Axis Labels
    const {xlabelheirarchy, xticks} = get_xLabelHeirarchy(XLeaves, xScale, date_level);
    xlabelheirarchy.each(d=> labelx_timeseries(d,svg.select(".xaxis_labels"), xScale, windowSize, margin, date_level));
    // Generate Y Axes
    draw_yaxes(svg, yScales, windowSize, margin);
    // Generate X Axes
    draw_xaxes(svg.select(".xaxes"), xScale, xticks, yScales);
    // Wrap the Y-axis labels
    svg.select(".yaxis_labels")
            .selectAll("text")
            .call(wrap, plot_height);

    // Draw the Violins
    draw_violins(svg, XLeaves, xScale, yScales, curve);
}
export function plotOperatorViolins(dataMap, windowSize, transform) {

    const modContainer = d3.select("#plot-container");
    //  Main svg container
    let svg = tableau.extensions.settings.get('Operatorsvg');
    if (!svg) {
      svg = modContainer.append("svg");
      tableau.extensions.settings.set('Operatorsvg', svg);
    }
  
    // The margins around the chart canvas.
    const margin = { top: 5, right: 1, bottom: 100, left: 80 };

    // The position and size of the chart canvas.
    const canvas = { 
        width: windowSize.width - (margin.left + margin.right),
        height: windowSize.height - (margin.top + margin.bottom)
    };
    if (canvas.height < 0 || canvas.width < 0) {
        // Abort rendering if the window is not large enough to render anything.
        svg.selectAll("*").remove();
        return;
    }

    const {data, yScales, nbins, plot_height} = groupby(dataMap, canvas, margin);
    const XLeaves = sortbyKeys(data);
    const xScale = get_xScale(XLeaves, windowSize, margin);
    bin_and_count(XLeaves, yScales, nbins, transform);
    compute_histogram(XLeaves, xScale);

    const curve = d3.curveCatmullRom.alpha(0.5);
    // Sets the viewBox to match windowSize
    svg.attr("viewBox", [0, 0, windowSize.width, windowSize.height]);
    svg.selectAll("*").remove();
    //  Prepare groups that will hold all elements of an area chart
    svg.append("g").attr("class", "yaxis_labels");
    svg.append("g").attr("class", "xaxis_labels");
    svg.append("g").attr("class", "histogram");
    svg.append("g").attr("class", "means");
    // Generate X-Axis Labels
    const {xlabelheirarchy, xticks} = get_xLabelHeirarchy(XLeaves, xScale);
    xlabelheirarchy.each(d=> labelx_operators(d,svg.select(".xaxis_labels"), xScale, windowSize, margin));
     // Compress the X-axis labels
    svg.select(".xaxis_labels")
            .selectAll("text")
            .call(compress_text, 1.2*margin.bottom);
    // Generate Y Axes
    draw_yaxes(svg, yScales, windowSize, margin, "0.8em");
    // Generate X Axes
    svg.append("g").attr("class", "xaxes");
    draw_xaxes(svg.select(".xaxes"), xScale, xticks, yScales);
    // Wrap the Y-axis labels
    svg.select(".yaxis_labels")
            .selectAll("text")
            .call(wrap, plot_height);
     //  Draw the Violins
     draw_violins(svg, XLeaves, xScale, yScales, curve);
    //  // Define the Zoom behavior
    // const zoom = d3.zoom()
    //   .scaleExtent([1, 32])
    //   .extent([[margin.left, 0], [windowSize.width - margin.right, windowSize.height]])
    //   .translateExtent([[margin.left, -Infinity], [windowSize.width - margin.right, Infinity]])
    //   .on("zoom", zoomed);

    // svg.call(zoom)
    // .transition()
    //   .duration(750)
    //   .call(zoom.scaleTo, 1);

    //   //  function to zoom
    // function zoomed(event) {
    //     const xz = event.transform.rescaleX(xScale);
    //     svg.select(".xaxis_labels").selectAll("*").remove();
    //     svg.select(".histogram").selectAll("*").remove();
    //     svg.select(".means").selectAll("*").remove();
    //     compute_histogram(XLeaves, xz);
    //     // Generate X-Axis Labels
    //     const {xlabelheirarchy, xticks} = get_xLabelHeirarchy(XLeaves, xz);
    //     xlabelheirarchy.each(d=> labelx_operators(d,svg.select(".xaxis_labels"), xz, windowSize, margin));
    //     // Compress the X-axis labels
    //     svg.select(".xaxis_labels")
    //     .selectAll("text")
    //     .call(compress_text, 1.2*margin.bottom);
    //     gx.call(draw_xaxes, xz, xticks, yScales);
    //     draw_violins(svg, XLeaves, xz, yScales, curve)
    // }
}
// --------------------------------------------------------------------------------------------------
// --------------------------------------------------------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------------------------------------------------------
// --------------------------------------------------------------------------------------------------
// function to groupby and organize data into subplots
function groupby(dataMap, canvas, margin) {
    let XLeaves = new Map();
    const yScales = new Map();
    const nbins = 30;
    const nplots = dataMap.size;
    const padding = 10;
    const plot_height = (canvas.height - (nplots-1) * padding)/nplots;
    let j = 0;
    for (const [plotkey, {columns, data}] of dataMap) {   
        let accesorfuncs = [];
        columns.forEach(col => {
        if (col.groupby) {
            accesorfuncs.push(createAccessorFunction(col.name))
        }
        });
        let allrows = data.filter(d => d.Y !== null && !isNaN(d.Y)).sort((a, b) => a.Y - b.Y);
        const maxy = d3.quantileSorted(allrows, 0.99, p => p.Y);
        const miny = d3.quantileSorted(allrows, 0, p => p.Y);
        const bin_size = (maxy - miny)/nbins;
        const plot_bottom = margin.top + (j+1) * plot_height + j * padding;
        const plot_top = margin.top + j * (plot_height + padding);
        let yScale = d3.scaleLinear().range([plot_bottom, plot_top]);
        yScale.domain([miny, maxy+bin_size]).nice();
        yScales.set(plotkey, {miny: miny, maxy: maxy, bin_size: bin_size, yScale: yScale, top: plot_top, bottom: plot_bottom});
        // Group by 
        d3.flatGroup(allrows, ...accesorfuncs)
            .forEach(row => {
                let values;
                let key = ""; 
                for (var i = 0; i < row.length; i++) {
                    if (typeof row[i] != 'object') {
                        if (('' + row[i]).includes("null")) {
                            key += "0000";
                        } else {
                           key += row[i]; 
                        }       
                    } else if (typeof row[i] === 'object') {
                        values = row[i];
                    }
                }
                if (XLeaves.has(key)) {
                    XLeaves.get(key).push({plotkey: plotkey, rows: values});
                } else {
                    let plotleaves = [{plotkey: plotkey, rows: values}];
                    XLeaves.set(key, plotleaves);
                }});
    j+=1;
    }
    return {data: XLeaves, yScales: yScales, nbins: nbins, plot_height: plot_height}
}
// Function to sort data by keys
function sortbyKeys(data, date_level = 1) {
    let XLeaves = [];
    data.forEach((plotleaves, key) => {
        let rowData = {};
        if (date_level > 1) {
            rowData["key0"] = key.substring(0, 4);
            rowData["key1"] = key.substring(4);
        } else {
            rowData["key0"] = key;
        }
        rowData["plotleaves"] = plotleaves;
        XLeaves.push(rowData)
    });
    //  Sort by Year first and then Quarter
    XLeaves = XLeaves.sort((a,b) => {
                    if (date_level > 1) {
                    if (a["key0"] != b["key0"]) {
                        return +a["key0"] - +b["key0"];
                    } else {
                        return +a["key1"].charAt(1) - +b["key1"].charAt(1);
                    }
                    } else {
                    return d3.ascending(a["key0"], b["key0"]);
                    }
                })
                .map((row, index) => {
                    row["xIndex"] = index;
                    return row;
                });
    return XLeaves;
}
// Function to pass to d3 groupby
function createAccessorFunction(propertyName){
    return (d) =>  d[propertyName];
  }
// functin to bin and count along the y axis
function bin_and_count(XLeaves, yScales, nbins, transform) {
    XLeaves.forEach(xLeaf => {
        xLeaf.plotleaves = xLeaf.plotleaves.map((plotleaf, i) => {
            const {miny, bin_size} = yScales.get(plotleaf.plotkey); 
            let sorted = plotleaf.rows.map(p => p.Y);
            plotleaf["mean"] = d3.mean(sorted);
            plotleaf["bins"]= sorted.map(p => ({
                bin: Math.min(Math.max(Math.floor((p-miny)/bin_size),0),nbins),
            }));
            return plotleaf;
            });

        xLeaf.plotleaves = xLeaf.plotleaves.map((plotleaf, i) => {
            const {miny, bin_size} = yScales.get(plotleaf.plotkey);
            plotleaf["histogram"] = d3.flatGroup(plotleaf.bins, p => p.bin)
                                        .map(p => ({
                                            bin: parseInt(p[0]),
                                            Y: miny + bin_size * (0.5 + parseInt(p[0])),
                                            count: p[1].length == 0 ? 0 :transform(p[1].length),
                                        })).sort((a, b) => a.bin - b.bin);
            return plotleaf
            });
    });
}
// function to get the histogram based on the X scale
function compute_histogram(XLeaves, xScale) {
    XLeaves.forEach(xLeaf => {
        xLeaf.plotleaves = xLeaf.plotleaves.map((plotleaf, i) => {
            const maxx = d3.max(plotleaf.histogram, p=>p.count);
            const step = xScale(1)-xScale(0); 
            const scale = d3.scaleLinear()
                                .domain([0, maxx])
                                .range([0, 0.45*step]);
            let x = xScale(xLeaf.xIndex);
            plotleaf["x"] = [x - 0.45*step, x + 0.45*step];                    
            plotleaf["histogram"] = plotleaf.histogram.map(p => {
                    p["x0"] = x + scale(p.count);
                    p["x1"] = x - scale(p.count);
                    return p
                });
            return plotleaf
            });
    });
}
// function to get the Xscale
function get_xScale(XLeaves, windowSize, margin) {
    const domain = d3.extent(XLeaves, p => p.xIndex);
    //  Define the X scale
    let xScale = d3
            .scaleLinear()
            .domain([domain[0]-1, domain[1]+1])
            .range([margin.left, windowSize.width - margin.right]);

    return xScale;
}
// function to get the x labels to display
function get_xLabelHeirarchy(XLeaves, xScale, date_level = 1) {
    // Compute the suitable ticks to show
    const domain = xScale.domain();
    const scaleWidth = xScale.range()[1] - xScale.range()[0];
    const minLabelWidth = 15;
    const maxCount = scaleWidth / minLabelWidth;
    let tickstep = Math.max(Math.ceil((domain[1]-domain[0]+1)/maxCount),1);
    let xticks = [];
    for (var i = Math.ceil(domain[0]+1); i < domain[1]; i+=tickstep) {
        xticks.push(i)
    }
    xticks = xticks.map(tick => XLeaves[tick]);
    
    let accesorfuncs = [];
    for (var i = 0; i < date_level; i++) {
     accesorfuncs.push(createAccessorFunction("key"+i));
    }
    const nested = d3.rollup(xticks, v=> d3.mean(v, v=> v.xIndex), ...accesorfuncs);
    return {xlabelheirarchy: d3.hierarchy(nested), xticks: xticks};
}
// function to draw the Y-axes
function draw_yaxes(svg, yScales, windowSize, margin, labelsize = "1em") {
    yScales.forEach((value, key) => {
        // generate y-axes for subplots
        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(
                d3.axisLeft(value.yScale)
                .ticks(3)
                .tickFormat(d => formatTick(d, value.maxy))
                )

        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(
                d3.axisLeft(value.yScale)
                .ticks(3)
                .tickSizeInner(-windowSize.width + margin.left + margin.right)
                .tickFormat(d => "")
                )
            .call(g => g.select(".domain")
                .remove())
            .call(g => g.selectAll(".tick:first-of-type line")
                .remove())
            .call(g => g.selectAll(".tick line")
                    .attr("stroke-opacity", 0.8)
                    .attr("stroke", "LightGray")
                    .attr("stroke-width", 1)
                    // .attr("transform", `translate(-6,0)`)
                    )
        //  generate y-axis labels
        svg.select(".yaxis_labels")
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("font-size", labelsize)
            .attr("text-anchor", "middle")
            .attr('x', -0.5*(value.top +value.bottom))
            .attr('y', '1em')
            .text(key);
    });
}
// function to draw the Y-axes
function draw_xaxes(gx, xScale, xticks, yScales) {
    yScales.forEach((value, key) => {
        //  generate X -axes for each subplot
        gx.append("g")
            .attr("transform", `translate(0,${value.bottom})`)
            .call(
                  d3.axisBottom(xScale)
                    .tickSize(5)
                    .tickValues(xticks.map(d=>d.xIndex))    
                    .tickFormat(d=> "")
            )
    });
}
// function for text wrapping from https://gist.github.com/mbostock/7555321
function wrap(text, width) {
    text.each(function() {
      let text = d3.select(this),
          words = text.text().split(/\s+/).reverse(),
          word,
          line = [],
          lineNumber = 0,
          lineHeight = 1.1, // ems
          y = text.attr("y"),
          x = text.attr("x"),
          dy = 0,//parseFloat(text.attr("dy")),
          tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", dy + "em");
      while (word = words.pop()) {
        line.push(word);
        tspan.text(line.join(" "));
        if (tspan.node().getComputedTextLength() > width) {
          line.pop();
          tspan.text(line.join(" "));
          line = [word];
          tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
        }
      }
    });
}
// function for nice formatting numbers 
function formatTick(d, max = d) {
    let s;
    if (max > 1e9) {
        s = (d / 1e9).toFixed(0) + "bil";
    }else if (max > 1e6 && max < 1e9) {
        s = (d / 1e6).toFixed(1) + "mil";
    }else if (max > 1e5 && max < 1e6) {
        s = (d / 1e3).toFixed(0) + "K";
    }else if (max < 1e5 && max > 100){
        s = d.toFixed(0);
    } else if (max < 100 && max > 10){
        s = d.toFixed(1);
    } else {
        s = d.toFixed(2);
    }
    return s
}

 // function for fitting the text labels in given amount of space
 function compress_text(text, width) {
    text.each(function() {
      let text = d3.select(this);
      const label = text.text();
      const end = label.length;
      let i=0;
      while (text.node().getComputedTextLength() > width) {
        i++;
        text.text(label.substring(0, end - i) + "...");     
      }
    });
}
// function to put x axis labels for time series at the right spot
function labelx_timeseries(node, container, xScale, windowSize, margin, date_level) {
    const line_height = 1.2; // in em
    if (node.data[0]) {
        const depth = node.height+1;
        const leafvalues = node.leaves().map(n=>n.data[1]);
        const mean = d3.mean(leafvalues);
        
        container.append("text")
                .attr("text-anchor", "middle")
                .attr("x", xScale(mean))
                .attr("y", windowSize.height - margin.bottom + 2)
                .attr("dy", depth * line_height + "em")
                .text(node.data[0]==="0000" ? (depth == date_level ? "NULL": "") : node.data[0]);
    }
}

// function to put x axis labels for operators at the right spot
function labelx_operators(node, container, xScale, windowSize, margin) {
    if (node.data[0]) {
        const depth = node.height+1;
        const leafvalues = node.leaves().map(n=>n.data[1]);
        const mean = d3.mean(leafvalues);
        
        container.append("text")
                .attr("transform", "rotate(-45)")
                .attr("font-size", "0.75em")
                .attr("text-anchor", "end")
                .attr("dominant-baseline", "middle")
                .attr("x", 0.70712 * (xScale(mean)-(windowSize.height - margin.bottom + 10)))
                .attr("y", 0.70712 * (xScale(mean)+ (windowSize.height - margin.bottom + 10)))
                // .attr("dx", -depth * line_height + "em")
                // .attr("dy", "0.5em")
                .text(node.data[0]==="0000" ? "NULL" : node.data[0]);
    }
}
// function to draw the violins
function draw_violins(svg, XLeaves, xScale, yScales, curve) {
    const domain = xScale.domain();
    const nleaves = domain[1] - domain[0];
    const step = xScale(1)-xScale(0);
    // Draw the Violins.
    XLeaves.forEach(xLeaf => {
        xLeaf.plotleaves.forEach((plotleaf, i) => {
            svg.select(".histogram")
                .append("path")
                .attr("fill", "steelblue")
                .attr("fill-opacity", 0.3)
                .attr("d", d3.area()
                            .x0(d => d.x0)
                            .x1(d => d.x1)
                            .y(d => yScales.get(plotleaf.plotkey).yScale(d.Y))
                            .curve(curve)(plotleaf.histogram));       
            svg.select(".means")
                .append("path")
                .datum(plotleaf.x)
                .attr("stroke", "black")
                .attr("stroke-width", 1)
                .attr("d", d3.line()
                            .x(d => d)
                            .y(yScales.get(plotleaf.plotkey).yScale(plotleaf.mean)));
        });
    });
    if (nleaves < 40) {
        XLeaves.forEach(xLeaf => {
            xLeaf.plotleaves.forEach((plotleaf, i) => {
                svg.select(".means")
                    .append("text")
                    .attr("transform", "rotate(-90)")
                    .attr("font-size", "0.75em")
                    // .attr("text-anchor", "middle")
                    .attr('x', -yScales.get(plotleaf.plotkey).yScale(plotleaf.mean))
                    .attr('dx', '0.25em')
                    .attr('y', xScale(xLeaf.xIndex) - 0.2 * step)
                    .text(formatTick(plotleaf.mean, yScales.get(plotleaf.plotkey).maxy))
            });
        });
    }
}
