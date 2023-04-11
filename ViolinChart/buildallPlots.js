
export function plotAll(dataMap, windowSize) {

    const modContainer = d3.select("#plot-container");
    //  Main svg container
    let svg = tableau.extensions.settings.get('svg');
    if (!svg) {
      svg = modContainer.append("svg");
      tableau.extensions.settings.set('svg', svg);
    }
  
    // The margins around the chart canvas.
    let margin = { top: 40, right: 40, bottom: 40, left: 80 };

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
    
    // Function to pass to d3 groupby
    function createAccessorFunction(propertyName){
      return (d) =>  d[propertyName];
    }
    let XLeaves = new Map();
    const yScales = new Map();
    const nbins = 30;
    const nplots = dataMap.size;
    const padding = 10;
    const plot_height = (canvas.height - (nplots-1) * padding)/nplots;
    let levels;
    let j = 0;
    for (const [plotkey, {columns, data}] of dataMap) {   
        let accesorfuncs = [];
        levels = 0;
        columns.forEach(col => {
        if (col.groupby) {
            accesorfuncs.push(createAccessorFunction(col.name))
            levels += 1;
        }
        });
        let allrows = data.filter(d => d.Y !== null && !isNaN(d.Y)).sort((a, b) => a.Y - b.Y);
        const maxy = d3.quantileSorted(allrows, 0.99, p => p.Y);
        const miny = d3.quantileSorted(allrows, 0, p => p.Y);
        const bin_size = (maxy - miny)/nbins;
        const plot_bottom = margin.top + (j+1) * plot_height + j * padding;
        const plot_top = margin.top + j * (plot_height + padding);
        let yScale = d3.scaleLinear().range([plot_bottom, plot_top]);
        yScale.domain([miny, maxy]).nice();
        yScales.set(plotkey, {miny: miny, maxy: maxy, bin_size: bin_size, yScale: yScale, top: plot_top, bottom: plot_bottom});
        d3.flatGroup(allrows, ...accesorfuncs)
            .forEach(row => {
                let values;
                let key = ""; 
                for (var i = 0; i < row.length; i++) {
                    if (typeof row[i] != 'object') {
                        key += row[i];
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
    let temp = [];
    XLeaves.forEach((plotleaves, key) => {
        let rowData = {};
        if (levels > 1) {
            rowData["key0"] = key.substring(0, 4);
            rowData["key1"] = key.substring(4);
        } else {
            rowData["key0"] = key;
        }
        rowData["plotleaves"] = plotleaves;
        temp.push(rowData)
    });
    XLeaves = temp.sort((a,b) => {
                    if (levels > 1) {
                    if (a["key0"] != b["key0"]) {
                        return +a["key0"] - +b["key0"];
                    } else {
                        return +a["key1"].charAt(1) - +b["key1"].charAt(1);
                    }
                    } else {
                    return d3.ascending(b["key0"], a["key0"]);
                    }
                })
                .map((row, index) => {
                    row["xIndex"] = index;
                    return row;
                });
    //  Adjust the bottom margin to make space for x axis labels
    const domain = d3.extent(XLeaves, p => p.xIndex);
    //  Define the X scale
    let xScale = d3
            .scaleLinear()
            .domain([domain[0]-1, domain[1]+1])
            .range([margin.left, windowSize.width - margin.right]);
    let step = xScale(1)-xScale(0);

    XLeaves.forEach(xLeaf => {
        xLeaf.plotleaves = xLeaf.plotleaves.map((plotleaf, i) => {
            const {miny, bin_size} = yScales.get(plotleaf.plotkey); 
            let sorted = plotleaf.rows.map(p => p.Y);
                                // .sort((a,b)=>a-b);
            // const min = d3.quantileSorted(sorted, 0);
            // const max = d3.quantileSorted(sorted, 1);
            // const q1 = d3.quantileSorted(sorted, 0.25);
            // const q3 = d3.quantileSorted(sorted, 0.75);
            // const iqr = q3 - q1; // interquartile range
            // const r0 = Math.max(min, q1 - iqr * 1.5);
            // const r1 = Math.min(max, q3 + iqr * 1.5);
            plotleaf["mean"] = d3.mean(sorted);
            // plotleaf["circles"] = sorted.filter(p => {            
            //     return (p < r0 || p > r1); 
            // });
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
                                            Y: miny + bin_size * parseInt(p[0]),
                                            count: p[1].length,
                                        })).sort((a, b) => a.bin - b.bin);
            let maxx = d3.max(plotleaf.histogram, p=>p.count);
            let scale = d3.scaleLinear()
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


    let curve = d3.curveCatmullRom.alpha(0.5);

    /**
     * Sets the viewBox to match windowSize
     */
    svg.attr("viewBox", [0, 0, windowSize.width, windowSize.height]);
    svg.selectAll("*").remove();

    /**
     * Prepare groups that will hold all elements of an area chart.
     * The groups are drawn in a specific order for the best user experience:
     * - 'histogram'
     */
    svg.append("g").attr("class", "histogram");
    svg.append("g").attr("class", "means");
    svg.append("g").attr("class", "points");
    svg.append("g").attr("class", "yaxis_labels");
    svg.append("g").attr("class", "xaxis_labels");
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
    /**
     * Compute the suitable ticks to show
     */
    const scaleWidth = xScale.range()[1] - xScale.range()[0];
    const minLabelWidth = 30;
    const maxCount = scaleWidth / minLabelWidth;
    let tickstep = Math.max(Math.ceil((domain[1]-domain[0]+1)/maxCount),1);
    let xticks = [];
    for (var i = 0; i <= domain[1]; i+=tickstep) {
        xticks.push(i)
    }
    xticks = xticks.map(tick => XLeaves[tick]);
    
    let accesorfuncs = [];
    for (var i = 0; i < levels; i++) {
     accesorfuncs.push(createAccessorFunction("key"+i));
    }
    let nested = d3.rollup(xticks, v=> d3.mean(v, v=> v.xIndex), ...accesorfuncs);

    let xlabelheirarchy = d3.hierarchy(nested)
    const line_height = 1.2;
    function labelrect(node, container) {
        if (node.data[0]) {
            const depth = node.height+1;
            const leafvalues = node.leaves().map(n=>n.data[1]);
            const x = d3.min(leafvalues)-1;
            const width = d3.max(leafvalues) - x + 1;
            const mean = d3.mean(leafvalues);
            // container.append("rect")
            //         .attr("x", xScale(x))
            //         .attr('width', xScale(width))
            //         .attr('height', rect_height)
            //         .attr("transform", `translate(0,${(depth-1) * rect_height})`)
            //         .attr('stroke', 'white')
            container.append("text")
                    .attr("text-anchor", "middle")
                    .attr("x", xScale(mean))
                    .attr("y", windowSize.height - margin.bottom+2)
                    .attr("dy", depth * line_height + "em")
                    .text(node.data[0])
                    // .attr("color", "black")
                    
        }
        
    }


    xlabelheirarchy.each(d=> labelrect(d,svg.select(".xaxis_labels")));

    yScales.forEach((value, key) => {
        svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3
                .axisLeft(value.yScale)
                .ticks(3)
                // .tickSize(styling.scales.tick.stroke != "none" ? 5 : 0)
                // .tickPadding(styling.scales.tick.stroke != "none" ? 3 : 9)
        );
        svg.select(".yaxis_labels")
            .append("text")
            .attr("transform", "rotate(-90)")
            // .attr("font-size", "smaller")
            .attr("text-anchor", "middle")
            .attr('x', -0.5*(value.top +value.bottom))
            .attr('y', '1em')
            .text(key)

        svg
            .append("g")
            .attr("transform", `translate(0,${value.bottom})`)
            .call(
                d3
                    .axisBottom(xScale)
                    .tickSize(5)
                    .tickValues(xticks.map(d=>d.xIndex))    
                    // .tickPadding(styling.scales.tick.stroke != "none" ? 3 : 9)
                    .tickFormat(d=> "") //xLeaves[d].formattedPath().split("»").at(-1)
            );
    });
    svg.select(".yaxis_labels")
            .selectAll("text")
            .call(wrap, plot_height);
    /**
     * Create aggregated groups, sort by sum and draw each one of them.
     */
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

            // svg.select(".points")
            //     .append("g")
            //     .selectAll("circle")
            //     .data(plotleaf.circles)
            //     .enter()
            //     .append("circle")
            //     .attr("cx", () => (Math.random() - 0.5) *0.03*step + xScale(xLeaf.xIndex))
            //     .attr("cy", d => yScales.get(plotleaf.plotkey).yScale(d))
            //     .attr("r", 0.07*step)
            //     .attr("fill", "black");
                
            svg.select(".means")
                .append("path")
                .datum(plotleaf.x)
                .attr("stroke", "black")
                .attr("stroke-width", 1)
                .attr("d", d3.line()
                            .x(d => d)
                            .y(yScales.get(plotleaf.plotkey).yScale(plotleaf.mean)));

            let formattedvalue;
            if (plotleaf.mean > 100) {
                formattedvalue = plotleaf.mean.toLocaleString('en-US', { maximumFractionDigits: 0});
            } else if (plotleaf.mean < 100 && plotleaf.mean > 1){
                formattedvalue = plotleaf.mean.toLocaleString('en-US', { maximumFractionDigits: 1});
            } else {
                formattedvalue = plotleaf.mean.toLocaleString('en-US', { maximumFractionDigits: 2});
            }

            svg.select(".means")
                .append("text")
                .attr("transform", "rotate(-90)")
                .style("font-size", "0.75em")
                // .attr("text-anchor", "middle")
                .attr('x', -yScales.get(plotleaf.plotkey).yScale(plotleaf.mean))
                .attr('dx', '0.1em')
                .attr('y', xScale(xLeaf.xIndex) - 0.2 * step)
                .text(formattedvalue)
        });
    });
}