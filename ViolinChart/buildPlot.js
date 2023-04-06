
export function plot(data, columns, windowSize) {

    const modContainer = d3.select("#plot-container");
    //  Main svg container
    let svg = tableau.extensions.settings.get('svg');
    if (!svg) {
      svg = modContainer.append("svg");
      tableau.extensions.settings.set('svg', svg);
    }
  
    // The margins around the chart canvas.
    let margin = { top: 20, right: 40, bottom: 40, left: 80 };

    // The position and size of the chart canvas.
    const canvas = { 
        top: margin.top,
        left: margin.left,
        width: windowSize.width - (margin.left + margin.right),
        height: windowSize.height - (margin.top + margin.bottom)

    };
    if (canvas.height < 0 || canvas.width < 0) {
        // Abort rendering if the window is not large enough to render anything.
        svg.selectAll("*").remove();
        return;
    }

    
    let allrows = data.filter(d => d.Y !== null && !isNaN(d.Y)).sort((a, b) => a.Y - b.Y);
    // Function to pass to d3 groupby
    function createAccessorFunction(propertyName){
      return (d) =>  d[propertyName];
    }
    let accesorfuncs = [];
    let levels = 0;
    columns.forEach(col => {
      if (col.groupby) {
        accesorfuncs.push(createAccessorFunction(col.name))
        levels += 1;
      }
    });
    //  Adjust the bottom margin to make space for x axis labels
    margin.bottom = 20 *(levels+1)
    const areaLeaves = d3.flatGroup(allrows, ...accesorfuncs)
                          .sort((a,b) => {
                              if (a.length > 2) {
                                if (a[0] != b[0]) {
                                  return +a[0] - +b[0];
                                } else {
                                  return +a[1].charAt(1) - +b[1].charAt(1);
                                }
                              } else {
                              return d3.ascending(b[0], a[0]);
                              }
                          })
                          .map((row, index) => {
                              let rowData = {};
                              let j = 0;
                                  for (var i = 0; i < row.length; i++) {
                                    if (typeof row[i] === 'string') {
                                      rowData["key" + j] =  row[i];
                                      j += 1;
                                    } else if (typeof row[i] === 'object') {
                                      rowData["values"] = row[i];
                                    }
                                    }
                                  rowData["xIndex"] = index;
                                  return rowData;
                            });

    const maxy = d3.quantile(allrows, 0.999, p => p.Y);
    const miny = d3.quantile(allrows, 0, p => p.Y);
    const nbins = 30
    const bin_size = (maxy - miny)/nbins
    // Define the Y scale
    let yScale = d3.scaleLinear().range([windowSize.height - margin.bottom, margin.top]);
    yScale.domain([miny, maxy]).nice();

    let areaSeries = areaLeaves.map((areaLeaf) => {
        let sorted = areaLeaf.values.map(p => p.Y)
                               .sort((a,b)=>a-b);
        const min = d3.quantileSorted(sorted, 0);
        const max = d3.quantileSorted(sorted, 1);
        const q1 = d3.quantileSorted(sorted, 0.25);
        const q3 = d3.quantileSorted(sorted, 0.75);
        const iqr = q3 - q1; // interquartile range
        const r0 = Math.max(min, q1 - iqr * 1.5);
        const r1 = Math.min(max, q3 + iqr * 1.5);
        areaLeaf["mean"] = d3.mean(sorted);
        areaLeaf["circles"] = sorted.filter(p => {            
            return (p < r0 || p > r1); 
        });
        areaLeaf["bins"]= sorted.map(p => ({
            bin: Math.min(Math.max(Math.floor((p-miny)/bin_size),0),nbins),
        }));
        return areaLeaf;
    });
    areaSeries = areaSeries.map((areaLeaf) => {
        areaLeaf["histogram"] = d3.flatGroup(areaLeaf.bins, p => p.bin)
                                    .map(p => ({
                                        bin: parseInt(p[0]),
                                        Y: miny + bin_size * parseInt(p[0]),
                                        count: p[1].length,
                                    })).sort((a, b) => a.bin - b.bin);
        return areaLeaf
    });


    const domain = d3.extent(areaSeries, p => p.xIndex);
    //  Define the X scale
    let xScale = d3
            .scaleLinear()
            .domain([domain[0]-1, domain[1]+1])
            .range([margin.left, windowSize.width - margin.right]);
    let step = xScale(1)-xScale(0);
    areaSeries = areaSeries.map((areaLeaf) => {
        let maxx = d3.max(areaLeaf.histogram, p=>p.count);
        let scale = d3.scaleLinear()
                            .domain([0, maxx])
                            .range([0, 0.45*step]);
        let x = xScale(areaLeaf.xIndex);
        areaLeaf["x"] = [x - 0.45*step, x + 0.45*step];                    
        areaLeaf["histogram"] = areaLeaf.histogram.map(p => {
            p["x0"] = x + scale(p.count);
            p["x1"] = x - scale(p.count);
            return p
        })
        return areaLeaf
    });
    areaSeries.forEach((serie) => {
        if (serie.histogram.length == 0) {
            return;
        }
        // Remove points with empty Y value.
        serie.histogram = serie.histogram.filter((p) => p.Y != null);
        
    });

    let curve = d3.curveCatmullRom.alpha(0.5);

    let area = d3
        .area()
        .x0((d) => d.x0)
        .x1((d) => d.x1)
        .y((d) => yScale(d.Y));

    

    /**
     * Maximum number of Y scale ticks is an approximate number
     * To get the said number we divide total available height by font size with some arbitrary padding
     */
    // const yScaleTickNumber = windowSize.height / (styling.scales.font.fontSize * 2 + 6);

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
    /**
     * Compute the suitable ticks to show
     */
    const scaleWidth = xScale.range()[1] - xScale.range()[0];
    const minLabelWidth = 40;
    const maxCount = scaleWidth / minLabelWidth;
    let tickstep = Math.max(Math.ceil((domain[1]-domain[0]+1)/maxCount),1);
    let xticks = [];
    for (var i = 0; i <= domain[1]; i+=tickstep) {
        xticks.push(i)
    }
    xticks = xticks.map(tick => areaLeaves[tick]);
    
    accesorfuncs = [];
    for (var i = 0; i < levels; i++) {
     accesorfuncs.push(createAccessorFunction("key"+i));
    }
    let nested = d3.rollup(xticks, v=> d3.mean(v, v=> v.xIndex), ...accesorfuncs);

    let xlabelheirarchy = d3.hierarchy(nested)
    const rect_height = 15;
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
                    .attr("transform", `translate(0,${windowSize.height - margin.bottom + depth * rect_height})`)
                    .text(node.data[0])
                    // .attr("color", "black")
                    
        }
        
    }
    // console.log(d3.ticks(domain[0], domain[1], 5));
    // /**
    //  * X axis group.
    //  */
    let xAxis = svg
        .append("g")
        .attr("transform", `translate(0,${windowSize.height - margin.bottom})`)
        .call(
            d3
                .axisBottom(xScale)
                .tickSize(5)
                .tickValues(xticks.map(d=>d.xIndex))    
                // .tickPadding(styling.scales.tick.stroke != "none" ? 3 : 9)
                .tickFormat(d=> "") //xLeaves[d].formattedPath().split("»").at(-1)
        );

    xlabelheirarchy.each(d=> labelrect(d,svg));

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3
                .axisLeft(yScale)
                // .ticks(yScaleTickNumber)
                // .tickSize(styling.scales.tick.stroke != "none" ? 5 : 0)
                // .tickPadding(styling.scales.tick.stroke != "none" ? 3 : 9)
        );


    /**
     * Style all strokes and text using current theme.
     */
    // svg.selectAll("path").attr("stroke", styling.scales.line.stroke);
    // svg.selectAll("line").attr("stroke", styling.scales.tick.stroke);
    // svg.selectAll("text")
    //     .attr("fill", styling.scales.font.color)
    //     .attr("font-family", styling.scales.font.fontFamily)
    //     .attr("font-size", styling.scales.font.fontSize);


    /**
     * Create aggregated groups, sort by sum and draw each one of them.
     */
    areaSeries.forEach(serie => {
        svg.select(".histogram")
            .append("path")
            .attr("fill", "steelblue")
            .attr("fill-opacity", 0.3)
            .attr("d", area.curve(curve)(serie.histogram));

        svg.select(".points")
            .append("g")
            .selectAll("circle")
            .data(serie.circles)
            .enter()
            .append("circle")
            .attr("cx", () => (Math.random() - 0.5) *0.03*step + xScale(serie.xIndex))
            .attr("cy", d => yScale(d))
            .attr("r", 0.07*step)
            .attr("fill", "black")
            .attr("tooltip", (d) => d);
            
        svg.select(".means")
            .append("path")
            .datum(serie.x)
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("d", d3.line()
                        .x(d => d)
                        .y(yScale(serie.mean)));
    });
}