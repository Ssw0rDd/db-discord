import { injectable } from 'tsyringe';

export interface AuthorTimelinePoint {
  label: string;
  counts: Record<string, number>;
}

export interface ChartDataset {
  labels: string[];
  authors: string[];
  timeline: AuthorTimelinePoint[];
  projectName: string;
  periodLabel?: string;
  chartStyle?: 'line' | 'bar';
}

const AUTHOR_COLORS = ['#ED4245', '#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC'];

@injectable()
export class StatsChartService {
  private buildChartConfig(data: ChartDataset) {
    const labels = data.labels.length ? data.labels : data.timeline.map((d) => d.label);
    const period = data.periodLabel ?? '14 dias';
    const style = data.chartStyle ?? 'line';
    const maxVal = Math.max(
      1,
      ...data.timeline.flatMap((point) => data.authors.map((author) => point.counts[author] ?? 0)),
    );

    const datasets = data.authors.map((author, index) => {
      const color = AUTHOR_COLORS[index % AUTHOR_COLORS.length];
      const values = data.timeline.map((point) => point.counts[author] ?? 0);
      if (style === 'bar') {
        return {
          label: author,
          data: values,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
        };
      }
      return {
        label: author,
        data: values,
        borderColor: color,
        backgroundColor: `${color}33`,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
      };
    });

    return {
      type: style,
      data: { labels, datasets },
      options: {
        layout: { padding: 12 },
        plugins: {
          title: {
            display: true,
            text: `${data.projectName} — ${period}`,
            color: '#ffffff',
            font: { size: 16, weight: 'bold' },
            padding: { bottom: 8 },
          },
          legend: {
            display: data.authors.length > 0,
            position: 'bottom' as const,
            labels: { color: '#ffffff', boxWidth: 14, padding: 14, usePointStyle: true },
          },
        },
        scales: {
          x: {
            ticks: { color: '#b5bac1', maxRotation: 0, font: { size: 11 } },
            grid: { color: '#404249' },
          },
          y: {
            min: 0,
            max: maxVal,
            ticks: { color: '#b5bac1', stepSize: 1, precision: 0, font: { size: 11 } },
            grid: { color: '#404249' },
            beginAtZero: true,
          },
        },
      },
    };
  }

  async generateStatsImage(data: ChartDataset): Promise<Buffer> {
    const res = await fetch(this.getChartEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.getChartRequestBody(data)),
    });
    if (!res.ok) throw new Error(`QuickChart falhou (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  private getChartRequestBody(data: ChartDataset) {
    return {
      width: 680,
      height: 360,
      backgroundColor: '#1e1f22',
      format: 'png',
      chart: this.buildChartConfig(data),
    };
  }

  private getChartEndpoint() {
    return 'https://quickchart.io/chart';
  }
}
