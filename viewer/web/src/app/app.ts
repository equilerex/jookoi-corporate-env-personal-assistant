import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  selector: 'jo-root',
  templateUrl: './app.html',
  styleUrls: ['./app.scss', './reset.scss'],
})
export class App {}
