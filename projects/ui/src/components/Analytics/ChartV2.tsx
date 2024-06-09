import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { FC } from '~/types';
import { createChart } from 'lightweight-charts';
import { hexToRgba } from '~/util/UI';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { setHours } from 'date-fns';
import { useChartSetupData } from './useChartSetupData';
import { BeanstalkPalette } from '../App/muiTheme';
/*
    List of Variables:
    formattedData (MUST BE IN ASCENDING ORDER)
    extraData (MUST BE IN ASCENDING ORDER)
    drawPegLine
    TODO: drawExploitLine (timestamp: 1650196810)
    size
    containerHeight
*/

type ChartV2DataProps = {
  /*
   *
   */
  formattedData: { time: number; value: number }[][];
  /*
   *
   */
  extraData?: Map<Number, String>;
  /*
   *
   */
  drawPegLine?: boolean;
  /*
   *
   */
  size?: "mini" | "full"
  /*
   *
   */
  timePeriod?: { from: Date | undefined, to: Date | undefined };
  /*
   *
   */
  containerHeight: number;
  /*
   *
   */
  selected: number[];
};

const chartColors = [
  {
    lineColor: BeanstalkPalette.logoGreen,
    topColor: hexToRgba(BeanstalkPalette.logoGreen, 0.8),
    bottomColor: hexToRgba(BeanstalkPalette.logoGreen, 0.2),
  },
  {
    lineColor: BeanstalkPalette.darkBlue,
    topColor: hexToRgba(BeanstalkPalette.darkBlue, 0.8),
    bottomColor: hexToRgba(BeanstalkPalette.darkBlue, 0.2),
  },
  {
    lineColor: BeanstalkPalette.washedRed,
    topColor: hexToRgba(BeanstalkPalette.washedRed, 0.8),
    bottomColor: hexToRgba(BeanstalkPalette.washedRed, 0.2),
  },
  {
    lineColor: BeanstalkPalette.theme.spring.chart.yellow,
    topColor: hexToRgba(BeanstalkPalette.theme.spring.chart.yellow, 0.8),
    bottomColor: hexToRgba(BeanstalkPalette.theme.spring.chart.yellow, 0.2),
  },
  {
    lineColor: BeanstalkPalette.theme.winter.error,
    topColor: hexToRgba(BeanstalkPalette.theme.winter.error, 0.8),
    bottomColor: hexToRgba(BeanstalkPalette.theme.winter.error, 0.2),
  }
];

const ChartV2: FC<ChartV2DataProps> = ({
  formattedData,
  extraData,
  drawPegLine,
  size = "full",
  containerHeight,
  timePeriod,
  selected
}) => {
  const chartContainerRef = useRef<any>();
  const chart = useRef<any>();
  const areaSeries = useRef<any>([]);
  const tooltip = useRef<any>();
  const chartHeight = containerHeight - ((tooltip.current?.clientHeight || 0 ));

  const [lastDataPoint, setLastDataPoint] = useState<any>();
  const [dataPoint, setDataPoint] = useState<any>();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const chartSetupData = useChartSetupData();


  useEffect(() => {
    if (!chartContainerRef.current || !chartHeight) return;
    const chartOptions = {
      layout: {
        fontFamily: theme.typography.fontFamily,
        background: { color: 'rgba(0, 0, 0, 0)' },
      },
      grid: {
        vertLines: { color: theme.palette.divider, visible: false },
        horzLines: { color: theme.palette.divider, visible: false },
      },
      crosshair: {
        // visible: false,
        vertLine: {
        //  labelVisible: false,
          labelBackgroundColor: theme.palette.text.primary,
        },
        horzLine: {
        // labelVisible: false,
          labelBackgroundColor: theme.palette.primary.main,
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
        visible: !(size === 'mini'),
        minBarSpacing: 0.001
      },
      rightPriceScale: {
        borderVisible: false,
        visible: !(size === 'mini')
      },
      leftPriceScale: selected.length < 2 ?  undefined : 
      {
        borderVisible: false,
        visible: !(size === 'mini')
      },
    };

    const handleResize = () => {
      chart.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
    };

    chart.current = createChart(chartContainerRef.current, chartOptions);
    const numberOfCharts = selected.length;
    if (numberOfCharts > 0) {
      for (let i = 0; i < numberOfCharts; i+=1) {
        areaSeries.current[i] = chart.current.addLineSeries({
          color: chartColors[i].lineColor,
          // topColor: chartColors[i].topColor,
          // bottomColor: chartColors[i].bottomColor,
          // pointMarkerVisible: false,
          lineWidth: 2,
          priceScaleId: i === 0 ? 'right' : i === 1 ? 'left' : '',
          priceFormat: {
            type: 'custom',
            formatter: chartSetupData[selected[i]].tickFormatter
          }
        });
      

        if (drawPegLine) {
          const pegLine = {
            price: 1,
            color: theme.palette.primary.dark,
            lineWidth: 1,
            lineStyle: 3, // LineStyle.Dashed
            axisLabelVisible: false,
            // title: 'line label here',
          };
          areaSeries.current[i].createPriceLine(pegLine);
        };
      };
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.current.remove();
    };
  }, [theme, drawPegLine, size, chartHeight, formattedData, chartSetupData, selected]);

  useMemo(() => {
    if (lastDataPoint) {
      const from = timePeriod?.from;
      const to = timePeriod?.to;
      if (!from) {
        chart.current.timeScale().fitContent();
      } else if (from && !to) {
        const newFrom = setHours(from, 0)
        const newTo = setHours(from, 23)
        chart.current.timeScale().setVisibleRange({
          from: newFrom.valueOf() / 1000,
          to: newTo.valueOf() / 1000,
        });
      } else {
        chart.current.timeScale().setVisibleRange({
          from: from.valueOf() / 1000,
          to: to!.valueOf() / 1000,
        });
      };
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod]);

  useEffect(() => {
    if (!chart.current || !formattedData || !extraData) return
    function getMergedData(commonData: { time: number | null; value: number | null }[]) {

      const date = commonData[0]?.time
        ? new Date((commonData[0].time) * 1000)
        : null;
      const value = commonData ? commonData.map((data) => data.value) : null;
      const additionalData =
        extraData && commonData[0]?.time ? extraData.get(commonData[0].time) : null;
      const formattedDate = date?.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return {
        time: formattedDate,
        value: value,
        season: additionalData,
      };
    }

    const numberOfCharts = selected?.length || 0;
    for (let i = 0; i < numberOfCharts; i+=1) {
      if (!formattedData[selected[i]]) return
      areaSeries.current[i].setData(formattedData[selected[i]]);
    };

    const lastCommonDataPoint = (formattedData[0] || selected[0]) 
      ? selected.map((selection) => {
        if (!formattedData[selection]) {
          return {
            time: null,
            value: null
          }
        }
        return {
          time: formattedData[selection][formattedData[selection].length -1].time,
          value: formattedData[selection][formattedData[selection].length -1].value
        }
      }) 
      : null
    setLastDataPoint(lastCommonDataPoint ? getMergedData(lastCommonDataPoint) : { time: 0, value: [0], season: 0 });

    chart.current.subscribeCrosshairMove((param: any) => {
      const hoveredDataPoints: any[] = [];
      areaSeries.current.forEach((series: any, index: number) => {
        const data = param.seriesData.get(series) || null;
        if (data) {
          hoveredDataPoints[index] = {
            value: data.value || null,
            time: data.time || null,
          };
        };
      });
      setDataPoint(getMergedData(hoveredDataPoints));
    });

    return () => {
      chart.current.unsubscribeCrosshairMove();
    };
  }, [formattedData, extraData, selected]);

  return (
    <Box>
      <Box
        ref={tooltip}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          padding: 0,
          marginTop: 2,
          marginLeft: 2,
          zIndex: 3,
          gap: 2,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
        }}
      >
        {selected.map((chartId, index) => {

        const tooltipTitle = chartSetupData[chartId].tooltipTitle;
        const tooltipHoverText = chartSetupData[chartId].tooltipHoverText;
        const value = dataPoint?.value[index] || lastDataPoint?.value[index] || 0;
          
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column'}}>
            <Box sx={{ 
              borderLeft: selected.length > 1 ? 2.5 : 0, 
              paddingLeft: selected.length > 1 ? 0.25 : 0,
              borderColor: chartColors[index].lineColor
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'row' }}>
                <Box sx={{ display: 'flex' }}>
                  <Typography variant="body1">{tooltipTitle}</Typography>
                  {tooltipHoverText && (
                    <Tooltip
                      title={tooltipHoverText}
                      placement={isMobile ? 'top' : 'right'}
                    >
                      <HelpOutlineIcon
                        sx={{
                          color: 'text.secondary',
                          display: 'inline',
                          mb: 0.5,
                          fontSize: '11px',
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
              </Box>
              <Typography variant="h2">
                {chartSetupData[chartId].tickFormatter(value || 0)}
              </Typography>
            </Box>
            {index === 0 && (
            <>
              <Typography variant="bodySmall" color="text.primary">
                Season{' '}
                {dataPoint && dataPoint.season
                  ? dataPoint.season
                  : lastDataPoint && lastDataPoint.season
                    ? lastDataPoint.season
                    : 0}
              </Typography>
              <Typography variant="bodySmall" color="text.primary">
                {dataPoint && dataPoint.time
                  ? dataPoint.time
                  : lastDataPoint && lastDataPoint.time
                    ? lastDataPoint.time
                    : 0}
              </Typography>
            </>
            )}
          </Box>
        )})}
      </Box>
      <Box
        ref={chartContainerRef}
        id="container"
        sx={{
          height: chartHeight - 20,
        }}
      />
    </Box>
  );
};

export default ChartV2;
